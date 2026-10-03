// Hybrid social audit: URL validation + reachability + the client's own answers. Never scrapes social platforms.
import { safeFetch } from '../utils/safeFetch.js';
import { gradeOf } from '../utils/grade.js';
export const PLATFORMS = { instagram: ['instagram.com'], facebook: ['facebook.com', 'fb.com'], linkedin: ['linkedin.com'], youtube: ['youtube.com', 'youtu.be'], x: ['x.com', 'twitter.com'] };
const FOLLOWERS = { '<500': 30, '500-2k': 50, '2k-10k': 75, '10k+': 100 };
const FREQ = { rarely: 10, monthly: 30, weekly: 60, '3+/week': 85, daily: 100 };
const RESP = { 'same-day': 100, '1-2d': 70, slow: 40, never: 10 };
const TIPS = {
  profileCompleteness: 'Complete your bio with what you do, your city and a link to your website.',
  consistency: 'Post on a steady schedule - even 3 posts a week builds trust and reach.',
  engagement: 'Reply to comments and messages quickly and ask questions in your posts.',
  contentVariety: 'Mix in short videos/Reels, customer stories and behind-the-scenes content.',
  conversion: 'Add a clear call-to-action (WhatsApp / website link) and try a small ad budget.',
  brandConsistency: 'Use the same logo, colours and name on every platform.',
};
const PLAN = { instagram: '3 Reels + 2 carousels per week', facebook: '3 posts per week + 1 offer or event', linkedin: '2-3 insight posts per week', youtube: '1 short video per week', x: '1 post per day' };
export function parseSocial(platform, raw) {
  let u; try { u = new URL(/^https?:\/\//i.test(raw) ? raw : 'https://' + raw); } catch { return { ok: false, error: 'This link does not look right' }; }
  const host = u.hostname.replace(/^www\.|^m\./, '');
  if (!PLATFORMS[platform].some((d) => host === d || host.endsWith('.' + d))) return { ok: false, error: `This does not look like a ${platform} link` };
  const seg = u.pathname.split('/').filter(Boolean), handle = (['company', 'in', 'channel', 'c', 'user'].includes(seg[0]) ? seg[1] : seg[0] || '').replace(/^@/, '');
  return { ok: true, url: u.href, handle };
}
async function reachable(url) {
  try { const r = await safeFetch(url, { method: 'HEAD', timeout: 2500, maxRedirects: 1 }); if (r.status === 404) return false; return r.status < 400 ? true : null; } catch { return null; } // null = could not verify
}
export async function auditSocial(links = {}, answers = {}) {
  const results = await Promise.all(Object.keys(PLATFORMS).map(async (p) => {
    if (!links[p]) return null;
    const parsed = parseSocial(p, links[p]);
    if (!parsed.ok) return [p, { valid: false, error: parsed.error }];
    const a = answers[p] || {}, reach = await reachable(parsed.url), yes = (v, y, n) => (v === true || v === 'yes' ? y : n);
    const dims = {
      profileCompleteness: yes(a.hasCta, 70, 30) + (reach === false ? 0 : 30),
      consistency: FREQ[a.frequency] ?? 30,
      engagement: Math.round(((FOLLOWERS[a.followers] ?? 30) + (RESP[a.responseTime] ?? 40)) / 2),
      contentVariety: yes(a.usesVideo, 100, 35),
      conversion: Math.round((yes(a.hasCta, 100, 20) + yes(a.runsAds, 100, 40)) / 2),
      brandConsistency: yes(a.consistentBranding, 100, 45),
    };
    const score = Math.round(Object.values(dims).reduce((x, y) => x + y, 0) / 6);
    return [p, { valid: true, url: parsed.url, handle: parsed.handle, linkStatus: reach === true ? 'reachable' : reach === false ? 'not found' : 'could not verify', score, grade: gradeOf(score), improvementNeeded: 100 - score, dimensions: dims, tips: Object.entries(dims).sort((x, y) => x[1] - y[1]).slice(0, 3).map(([k]) => TIPS[k]), postingPlan: PLAN[p] }];
  }));
  const entries = results.filter(Boolean);
  const platforms = Object.fromEntries(entries);
  const scored = Object.values(platforms).filter((x) => x.valid);
  const score = scored.length ? Math.round(scored.reduce((a, x) => a + x.score, 0) / scored.length) : null;
  return { score, grade: score === null ? null : gradeOf(score), improvementNeeded: score === null ? null : 100 - score, platforms, basedOn: 'Based on the details you shared' };
}
