// All ranges are computed in IST (UTC+5:30). Returns { from, to, prevFrom, prevTo }; `to` is exclusive.
const IST = 330 * 60000, DAY = 864e5;
const sod = (t) => Math.floor((t + IST) / DAY) * DAY - IST;
export function resolveRange(q = {}, now = Date.now()) {
  const today = sod(now), d = new Date(today + IST);
  const dow = (d.getUTCDay() + 6) % 7; // Monday = 0
  const monthStart = (y, m) => Date.UTC(y, m, 1) - IST;
  const y = d.getUTCFullYear(), m = d.getUTCMonth();
  let from, to;
  switch (q.range || 'last30') {
    case 'today': [from, to] = [today, today + DAY]; break;
    case 'yesterday': [from, to] = [today - DAY, today]; break;
    case 'thisWeek': [from, to] = [today - dow * DAY, today + DAY]; break;
    case 'lastWeek': [from, to] = [today - (dow + 7) * DAY, today - dow * DAY]; break;
    case 'last7': [from, to] = [today - 6 * DAY, today + DAY]; break;
    case 'thisMonth': [from, to] = [monthStart(y, m), today + DAY]; break;
    case 'lastMonth': [from, to] = [monthStart(y, m - 1), monthStart(y, m)]; break;
    case 'custom': {
      const a = Date.parse(q.from), b = Date.parse(q.to);
      if (Number.isNaN(a) || Number.isNaN(b) || b < a) { const e = new Error('Please choose a valid date range'); e.status = 400; throw e; }
      [from, to] = [sod(a), sod(b) + DAY]; break;
    }
    default: [from, to] = [today - 29 * DAY, today + DAY];
  }
  const len = to - from;
  return { from: new Date(from), to: new Date(to), prevFrom: new Date(from - len), prevTo: new Date(from) };
}
