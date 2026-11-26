// 날짜·정렬 계산(화면 없음). 날짜는 모두 'YYYY-MM-DD' 문자열.
export const kstToday = (now = new Date()) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(now);

const toUTC = (iso) => Date.parse(`${iso}T00:00:00Z`);
export const addDays = (iso, n) => new Date(toUTC(iso) + n * 864e5).toISOString().slice(0, 10);
export const daysBetween = (a, b) => Math.round((toUTC(b) - toUTC(a)) / 864e5);
export const weekday = (iso) => new Date(toUTC(iso)).getUTCDay(); // 0=일

// 시작일 미공개(start=null)는 기사 게재일에 이미 운영 중인 것으로 본다(화면에 '시작일 미공개' 표기).
export const startOf = (item) => item.start || item.published;
export const overlaps = (item, from, to) => startOf(item) <= to && item.end >= from;

export function weekRange(today) {
  const sunday = addDays(today, (7 - weekday(today)) % 7);
  return [today, sunday];
}

export function weekendRange(today) {
  const sunday = weekRange(today)[1];
  const saturday = addDays(sunday, -1);
  return [saturday < today ? today : saturday, sunday];
}

export const endingSoon = (items, today, days = 7) =>
  items.filter((i) => overlaps(i, today, today) && daysBetween(today, i.end) <= days);

export function status(item, today) {
  if (item.end < today) return { key: 'ended', text: '종료' };
  if (item.start && item.start > today) return { key: 'soon', text: `오픈 D-${daysBetween(today, item.start)}` };
  const left = daysBetween(today, item.end);
  if (left === 0) return { key: 'last', text: '오늘 마감' };
  return { key: left <= 7 ? 'last' : 'on', text: `마감 D-${left}` };
}

export function distanceKm(a, b) {
  const rad = (d) => (d * Math.PI) / 180;
  const h = Math.sin(rad(b.lat - a.lat) / 2) ** 2
    + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lon - a.lon) / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(h));
}

export function sortItems(items, by, here) {
  const byEnd = (a, b) => a.end.localeCompare(b.end) || a.name.localeCompare(b.name, 'ko');
  const dist = (i) => (here && i.lat ? distanceKm(here, i) : Infinity);
  const compare = {
    end: byEnd,
    category: (a, b) => a.category.localeCompare(b.category, 'ko') || byEnd(a, b),
    distance: (a, b) => (dist(a) === dist(b) ? byEnd(a, b) : dist(a) - dist(b)),
  }[by] || byEnd;
  return [...items].sort(compare);
}

// 화면에서 가까운 핀(minPx 미만)은 하나로 묶는다. project 는 좌표→화면 {x,y}.
export function cluster(items, project, minPx = 36) {
  return items.reduce((groups, item) => {
    const at = project(item);
    const near = groups.find((g) => Math.hypot(g.at.x - at.x, g.at.y - at.y) < minPx);
    if (!near) return [...groups, { at, items: [item] }];
    return groups.map((g) => (g === near ? { ...g, items: [...g.items, item] } : g));
  }, []);
}
