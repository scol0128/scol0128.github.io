import * as core from './core.js';

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const today = params.get('today') || core.kstToday(); // ?today= 는 화면 시험용
const RANGES = [['week', '이번 주'], ['weekend', '이번 주말'], ['ending', '종료 임박'], ['month', '월 달력']];
const SORTS = [['end', '마감 빠른순'], ['distance', '가까운순'], ['category', '분류순']];

let state = { items: [], region: '전체', range: 'week', sort: 'end', here: null, day: today, month: today.slice(0, 7) };
let map;
let markers;
let placedNow = [];

// 외부에서 온 글자는 textContent 로만 넣는다.
function el(tag, attrs = {}, ...children) {
  const node = Object.assign(document.createElement(tag), attrs);
  node.append(...children.filter(Boolean));
  return node;
}
const link = (href, text) => el('a', { href: /^https?:\/\//.test(href) ? href : '#', textContent: text, target: '_blank', rel: 'noopener' });
const md = (iso) => `${Number(iso.slice(5, 7))}.${Number(iso.slice(8))}`;
const period = (i) => {
  const year = i.end.slice(0, 4) === today.slice(0, 4) ? '' : `${i.end.slice(0, 4)}.`;
  return `${i.start ? md(i.start) : '시작일 미공개'} ~ ${year}${md(i.end)}`;
};

function card(i) {
  const st = core.status(i, today);
  const km = state.here && i.lat ? ` · ${core.distanceKm(state.here, i).toFixed(1)}km` : '';
  const place = [i.venue, i.place_detail].filter(Boolean).join(' · ');
  const where = `https://map.naver.com/p/search/${encodeURIComponent(i.venue.replace(/\s*\(.*\)/, ''))}`;
  return el('article', { className: 'card' },
    el('div', { className: 'row' },
      el('span', { className: `badge ${st.key}`, textContent: st.text }),
      el('span', { className: 'cat', textContent: i.kind === '팝업' ? i.category : `${i.kind} · ${i.category}` })),
    el('h3', { textContent: i.name }),
    el('p', { className: 'brand', textContent: i.brand }),
    el('p', { className: 'period', textContent: period(i) }),
    el('p', { textContent: place + km }),
    el('p', { className: 'addr', textContent: i.address || (i.lat ? (i.approx ? '지도 위치는 대략(역·동네 중심)' : '') : '지도 좌표 미확인') }),
    el('p', { className: 'links' }, link(i.source_url, `출처 ${i.source_name.replace(/^(www|m)\./, '')}`), link(where, '네이버 지도 검색'),
      el('span', { textContent: `확인 ${md(i.checked)}` })));
}

function fill(node, items, empty = '해당하는 팝업이 없습니다.') {
  node.replaceChildren(...(items.length ? items.map(card) : [el('p', { className: 'empty', textContent: empty })]));
}

function chips(node, options, current, onPick) {
  node.replaceChildren(...options.map(([key, label]) => el('button', {
    type: 'button', textContent: label, className: key === current ? 'on' : '', onclick: () => onPick(key),
  })));
}

const visible = () => state.items.filter((i) => state.region === '전체' || i.region === state.region);

function drawPins() {
  markers.clearLayers();
  const groups = core.cluster(placedNow, (i) => map.project([i.lat, i.lon], map.getZoom()));
  for (const { items: group } of groups) {
    const [first] = group;
    const venues = [...new Set(group.map((i) => i.venue))].join(', ');
    const icon = L.divIcon({ className: group.every((i) => i.approx) ? 'pin approx' : 'pin', html: `<b>${group.length}</b>`, iconSize: [34, 34] });
    L.marker([first.lat, first.lon], { icon, title: `${venues} ${group.length}건` })
      .on('click', () => {
        fill($('map-list'), core.sortItems(group, 'end'));
        $('map-list').prepend(el('h2', { textContent: venues }));
        $('map-list').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      })
      .addTo(markers);
  }
}

function renderMap(items) {
  const placed = items.filter((i) => i.lat);
  const missing = items.length - placed.length;
  $('map-note').textContent = missing ? `좌표를 확인하지 못한 ${missing}건은 지도에 없습니다(목록·일정에는 있음).` : '';
  if (!window.L) { $('map').textContent = '지도를 불러오지 못했습니다.'; return; }
  if (!map) {
    map = L.map('map', { zoomControl: true }).setView([37.53, 126.99], 11);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19, attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(map);
    markers = L.layerGroup().addTo(map);
    map.on('zoomend', drawPins);
  }
  map.invalidateSize();
  placedNow = placed;
  // 전국 단위면 수도권을 먼저 보여 주고, 지역을 고르면 그 지역에 맞춘다.
  const focus = state.region === '전체' ? placed.filter((i) => i.lat > 37.3 && i.lat < 37.7 && i.lon > 126.7) : placed;
  if (!focus.length) map.setView([37.53, 126.99], 11, { animate: false });
  if (focus.length) map.fitBounds(focus.map((i) => [i.lat, i.lon]), { padding: [30, 30], maxZoom: 15, animate: false });
  drawPins();
  fill($('map-list'), core.sortItems(items.filter((i) => core.overlaps(i, today, today)), 'end'), '오늘 운영 중인 팝업이 없습니다.');
  $('map-list').prepend(el('h2', { textContent: '오늘 운영 중 · 마감 빠른순' }));
}

function renderMonth(items) {
  const [y, m] = state.month.split('-').map(Number);
  const first = `${state.month}-01`;
  const count = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const move = (n) => {
    const d = new Date(Date.UTC(y, m - 1 + n, 1)).toISOString().slice(0, 7);
    state = { ...state, month: d, day: d === today.slice(0, 7) ? today : `${d}-01` };
    render();
  };
  const cells = ['일', '월', '화', '수', '목', '금', '토'].map((d) => el('span', { className: 'dow', textContent: d }));
  for (let k = 0; k < core.weekday(first); k += 1) cells.push(el('span'));
  for (let d = 1; d <= count; d += 1) {
    const iso = `${state.month}-${String(d).padStart(2, '0')}`;
    const n = iso < today ? 0 : items.filter((i) => core.overlaps(i, iso, iso)).length;
    cells.push(el('button', {
      type: 'button', disabled: iso < today,
      className: [iso === state.day ? 'on' : '', iso === today ? 'today' : ''].join(' '),
      onclick: () => { state = { ...state, day: iso }; render(); },
    }, el('b', { textContent: d }), el('small', { textContent: n ? `${n}건` : '' })));
  }
  $('month').replaceChildren(
    el('div', { className: 'month-head' },
      el('button', { type: 'button', textContent: '‹', ariaLabel: '이전 달', disabled: state.month <= today.slice(0, 7), onclick: () => move(-1) }),
      el('strong', { textContent: `${y}년 ${m}월` }),
      el('button', { type: 'button', textContent: '›', ariaLabel: '다음 달', onclick: () => move(1) })),
    el('div', { className: 'grid' }, ...cells));
}

function renderCalendar(items) {
  chips($('ranges'), RANGES, state.range, (range) => { state = { ...state, range }; render(); });
  $('month').replaceChildren();
  let title;
  let list;
  if (state.range === 'ending') {
    title = '7일 안에 끝나는 팝업';
    list = core.endingSoon(items, today);
  } else if (state.range === 'month') {
    renderMonth(items);
    title = `${md(state.day)} 운영`;
    list = items.filter((i) => core.overlaps(i, state.day, state.day));
  } else {
    const [from, to] = state.range === 'week' ? core.weekRange(today) : core.weekendRange(today);
    title = from === to ? `${md(from)} 갈 수 있는 곳` : `${md(from)} ~ ${md(to)} 갈 수 있는 곳`;
    list = items.filter((i) => core.overlaps(i, from, to));
  }
  $('cal-title').textContent = `${title} (${list.length})`;
  fill($('cal-list'), core.sortItems(list, 'end'));
}

function renderList(items) {
  chips($('sorts'), SORTS, state.sort, (sort) => {
    state = { ...state, sort };
    if (sort === 'distance' && !state.here) locate();
    render();
  });
  if (state.sort !== 'distance') $('list-note').textContent = '';
  fill($('list'), core.sortItems(items, state.sort, state.here));
}

function locate() {
  const note = (text) => { $('list-note').textContent = text; };
  if (!navigator.geolocation) { note('이 기기에서는 위치를 쓸 수 없습니다.'); return; }
  note('현재 위치를 확인하는 중…');
  navigator.geolocation.getCurrentPosition(
    (p) => { state = { ...state, here: { lat: p.coords.latitude, lon: p.coords.longitude } }; note('위치는 이 기기 안에서만 씁니다.'); render(); },
    () => note('위치 권한이 없어 마감순으로 보여 줍니다.'),
    { timeout: 10000 },
  );
}

function render() {
  const view = ['map', 'cal', 'list'].find((v) => location.hash === `#${v}`) || 'map';
  document.querySelectorAll('.view').forEach((s) => { s.hidden = s.id !== `view-${view}`; });
  document.querySelectorAll('nav a').forEach((a) => a.classList.toggle('on', a.hash === `#${view}`));
  const count = (r) => state.items.filter((i) => i.region === r).length;
  const regions = ['전체', ...[...new Set(state.items.map((i) => i.region))].sort((a, b) => count(b) - count(a))];
  chips($('regions'), regions.map((r) => [r, r]), state.region, (region) => { state = { ...state, region }; render(); });
  const items = visible();
  $('summary').textContent = `${md(today)} 기준 ${items.length}건`;
  ({ map: renderMap, cal: renderCalendar, list: renderList })[view](items);
}

async function start() {
  const data = await (await fetch('data/popups.json', { cache: 'no-cache' })).json();
  state = { ...state, items: data.items.filter((i) => i.end >= today) };
  $('built').textContent = `자료 갱신 ${data.built}`;
  window.addEventListener('hashchange', () => { render(); window.scrollTo(0, 0); });
  render();
}

start().catch((error) => {
  console.error(error);
  $('summary').textContent = '자료를 불러오지 못했습니다. 새로고침해 주세요.';
});
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('sw.js');
