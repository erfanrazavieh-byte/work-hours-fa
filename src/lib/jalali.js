import jalaali from 'jalaali-js';
export const pad = n => String(n).padStart(2, '0');
export function todayJalali() {
  const d = new Date();
  const j = jalaali.toJalaali(d.getFullYear(), d.getMonth() + 1, d.getDate());
  return `${j.jy}-${pad(j.jm)}-${pad(j.jd)}`;
}
export function jalaliToIso(value) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value || '');
  if (!m) return null;
  const jy = +m[1], jm = +m[2], jd = +m[3];
  if (!jalaali.isValidJalaaliDate(jy, jm, jd)) return null;
  const g = jalaali.toGregorian(jy, jm, jd);
  return `${g.gy}-${pad(g.gm)}-${pad(g.gd)}`;
}
export function isoToJalali(value) {
  if (!value) return '';
  const [gy, gm, gd] = value.slice(0, 10).split('-').map(Number);
  const j = jalaali.toJalaali(gy, gm, gd);
  return `${j.jy}-${pad(j.jm)}-${pad(j.jd)}`;
}
export function monthParts(value) {
  const [year, month] = value.split('-').map(Number);
  return { year, month };
}
export function monthStartIso(jy, jm) { return jalaliToIso(`${jy}-${pad(jm)}-01`); }
export function shiftJalaliMonth(value, delta) {
  let { year, month } = monthParts(value);
  month += delta;
  while (month < 1) { month += 12; year--; }
  while (month > 12) { month -= 12; year++; }
  return `${year}-${pad(month)}-01`;
}
export function monthTitle(value) {
  const { year, month } = monthParts(value);
  const names = ['فروردین','اردیبهشت','خرداد','تیر','مرداد','شهریور','مهر','آبان','آذر','دی','بهمن','اسفند'];
  return `${names[month - 1]} ${year}`;
}
export function jalaliMonthBounds(value) {
  const { year, month } = monthParts(value);
  const next = shiftJalaliMonth(value, 1);
  const nextParts = monthParts(next);
  return { start: monthStartIso(year, month), end: monthStartIso(nextParts.year, nextParts.month) };
}