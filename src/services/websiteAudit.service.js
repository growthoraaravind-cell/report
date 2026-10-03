// Real automated website audit. Uses Google PageSpeed (if key set) + own HTML checks. Falls back to "basic scan".
import * as cheerio from 'cheerio';
import { safeFetch } from '../utils/safeFetch.js';
import { gradeOf } from '../utils/grade.js';

export function normalizeUrl(raw) {
  let s = String(raw || '').trim();
  if (!s) throw Object.assign(new Error('Please enter your website address'), { status: 400 });
  if (!/^https?:\/\//i.test(s)) s = 'https://' + s;
  const u = new URL(s);
  if (!u.hostname.includes('.')) throw Object.assign(new Error('Please enter a valid website address'), { status: 400 });
  return u.href;
}
async function pagespeed(url, strategy) {
  const key = process.env.PAGESPEED_API_KEY; if (!key) return null;
  try {
    const q = new URLSearchParams({ url, strategy, key });
    ['performance', 'accessibility', 'best-practices', 'seo'].forEach((c) => q.append('category', c));
    const r = await fetch(`https://www.googleapis.com/pagespeedonline/v5/runPagespeed?${q}`, { signal: AbortSignal.timeout(8000) });
    if (!r.ok) return null;
    const { lighthouseResult: l } = await r.json(), c = l.categories, a = l.audits, pct = (x) => Math.round((x?.score ?? 0) * 100);
    return { performance: pct(c.performance), accessibility: pct(c.accessibility), bestPractices: pct(c['best-practices']), seo: pct(c.seo), lcp: a['largest-contentful-paint']?.displayValue, cls: a['cumulative-layout-shift']?.displayValue, tbt: a['total-blocking-time']?.displayValue };
  } catch { return null; }
}
const exists = async (u) => { try { return (await safeFetch(u, { timeout: 3000, maxRedirects: 1, maxBytes: 20000 })).status === 200; } catch { return false; } };
const WEIGHTS = { Performance: 25, SEO: 20, 'Mobile Experience': 15, Security: 10, 'Content & Conversion': 20, Accessibility: 10 };

export async function auditWebsite(rawUrl) {
  const url = normalizeUrl(rawUrl);
  let page;
  try { page = await safeFetch(url, { timeout: 5000, maxRedirects: 2 }); }
  catch (e) { return { url, reachable: false, mode: 'none', score: 0, improvementNeeded: 100, grade: 'Getting started', error: 'We could not open this website right now. Please check the address and try again.', categories: {}, checklist: [], quickWins: [] }; }
  const origin = new URL(page.finalUrl).origin, $ = cheerio.load(page.body);
  const [robots, sitemap, psiM, psiD] = await Promise.all([exists(origin + '/robots.txt'), exists(origin + '/sitemap.xml'), pagespeed(page.finalUrl, 'mobile'), pagespeed(page.finalUrl, 'desktop')]);
  const text = $('body').text(), html = page.body;
  const title = $('title').first().text().trim(), desc = $('meta[name="description"]').attr('content')?.trim() || '';
  const imgs = $('img'), withAlt = imgs.filter((_, e) => ($(e).attr('alt') || '').trim()).length;
  const links = $('a[href]').map((_, e) => $(e).attr('href')).get();
  const checklist = [];
  const chk = (category, id, label, pass, weight, tip) => checklist.push({ category, id, label, pass: !!pass, weight, tip });
  chk('Security', 'https', 'Website uses HTTPS', page.finalUrl.startsWith('https://'), 6, 'Install an SSL certificate so visitors see the secure padlock.');
  chk('Security', 'hsts', 'HSTS security header present', page.headers.get('strict-transport-security'), 2, 'Enable the Strict-Transport-Security header on your server.');
  chk('Security', 'xcto', 'Content-type protection header', page.headers.get('x-content-type-options'), 2, 'Add the X-Content-Type-Options: nosniff header.');
  chk('SEO', 'title', 'Page title is 30-65 characters', title.length >= 30 && title.length <= 65, 4, 'Write a clear title with your main service and city.');
  chk('SEO', 'desc', 'Meta description is 70-160 characters', desc.length >= 70 && desc.length <= 160, 4, 'Add a compelling meta description that invites clicks.');
  chk('SEO', 'h1', 'Exactly one H1 heading', $('h1').length === 1, 3, 'Use a single H1 that states what you offer.');
  chk('SEO', 'canonical', 'Canonical link set', $('link[rel="canonical"]').length, 2, 'Add a canonical tag to avoid duplicate-content issues.');
  chk('SEO', 'robots', 'robots.txt available', robots, 2, 'Publish a robots.txt file.');
  chk('SEO', 'sitemap', 'sitemap.xml available', sitemap, 3, 'Publish and submit a sitemap.xml to Google Search Console.');
  chk('SEO', 'og', 'Open Graph / Twitter tags', $('meta[property^="og:"]').length >= 3 || $('meta[name^="twitter:"]').length, 2, 'Add social-sharing tags so links look great when shared.');
  chk('SEO', 'schema', 'Structured data (JSON-LD)', $('script[type="application/ld+json"]').length, 2, 'Add Organization / LocalBusiness structured data.');
  chk('Mobile Experience', 'viewport', 'Mobile viewport configured', $('meta[name="viewport"]').length, 8, 'Add a responsive viewport meta tag and mobile-friendly layout.');
  chk('Mobile Experience', 'lang', 'Language attribute on <html>', $('html').attr('lang'), 2, 'Add lang="en" to the html tag.');
  chk('Performance', 'speed', 'Server responds in under 1.5 s', page.ms < 1500, 5, 'Use caching or a CDN to speed up the first response.');
  chk('Performance', 'weight', 'Homepage HTML under 500 KB', page.bytes < 500_000, 3, 'Reduce page weight: compress and lazy-load heavy assets.');
  chk('Performance', 'favicon', 'Favicon present', $('link[rel*="icon"]').length, 1, 'Add a favicon with your logo.');
  chk('Content & Conversion', 'contact', 'Phone or email visible', links.some((h) => /^(tel|mailto):/i.test(h)) || /\+?\d[\d\s-]{9,}/.test(text), 5, 'Show a clickable phone number and email.');
  chk('Content & Conversion', 'cta', 'Clear call-to-action / form', $('form, button, a.btn, a[class*="button"]').length, 5, 'Add a prominent button such as "Get a free quote".');
  chk('Content & Conversion', 'social', 'Social media links on site', links.some((h) => /(instagram|facebook|linkedin|youtube|twitter|x)\.com/i.test(h)), 3, 'Link your social profiles from the header or footer.');
  chk('Content & Conversion', 'analytics', 'Analytics installed', /googletagmanager|google-analytics|gtag\(|clarity\.ms|plausible/i.test(html), 4, 'Install Google Analytics so you can see what works.');
  chk('Content & Conversion', 'words', 'Enough page content (300+ words)', text.split(/\s+/).filter(Boolean).length >= 300, 3, 'Add helpful content explaining your services and results.');
  chk('Accessibility', 'alt', 'Images have alt text (80%+)', !imgs.length || withAlt / imgs.length >= 0.8, 6, 'Describe each image with short alt text.');
  chk('Accessibility', 'labels', 'Form fields have labels', !$('input:not([type=hidden]):not([type=submit])').length || $('label').length > 0, 4, 'Add visible labels to form fields.');
  const cats = {};
  for (const name of Object.keys(WEIGHTS)) {
    const items = checklist.filter((c) => c.category === name), tw = items.reduce((a, c) => a + c.weight, 0) || 1;
    let score = Math.round((items.filter((c) => c.pass).reduce((a, c) => a + c.weight, 0) / tw) * 100);
    const psi = { Performance: psiM?.performance, Accessibility: psiM?.accessibility, 'Mobile Experience': psiM?.performance, SEO: psiM?.seo }[name];
    if (psi !== undefined && psi !== null) score = Math.round((score + psi) / 2);
    cats[name] = score;
  }
  const score = Math.round(Object.entries(WEIGHTS).reduce((a, [k, w]) => a + cats[k] * w, 0) / 100);
  const quickWins = checklist.filter((c) => !c.pass).sort((a, b) => b.weight - a.weight).slice(0, 5).map((c) => ({ title: c.label, tip: c.tip, category: c.category }));
  return { url: page.finalUrl, reachable: true, mode: psiM ? 'full' : 'basic', modeNote: psiM ? 'Includes Google PageSpeed data' : 'Basic scan - detailed speed data unavailable', score, grade: gradeOf(score), improvementNeeded: 100 - score, categories: cats, checklist, quickWins, pagespeed: { mobile: psiM, desktop: psiD }, metrics: { responseMs: page.ms, bytes: page.bytes, images: imgs.length, imagesWithAlt: withAlt } };
}
