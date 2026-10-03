// SSRF-safe fetch: only public http(s) hosts, every redirect hop re-validated, size/time capped.
import dns from 'node:dns/promises';
import net from 'node:net';
export function isPrivateIp(ip) {
  if (net.isIPv6(ip)) {
    const l = ip.toLowerCase();
    return l === '::1' || l === '::' || l.startsWith('fc') || l.startsWith('fd') || l.startsWith('fe80') || (l.startsWith('::ffff:') && isPrivateIp(l.slice(7)));
  }
  const [a, b] = ip.split('.').map(Number);
  return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
}
export async function assertPublicUrl(raw) {
  const url = new URL(raw);
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Only http(s) links are supported');
  const host = url.hostname.replace(/^\[|\]$/g, '');
  const addrs = net.isIP(host) ? [{ address: host }] : await dns.lookup(host, { all: true });
  if (!addrs.length || addrs.some((a) => isPrivateIp(a.address))) throw new Error('This address cannot be scanned');
  return url;
}
export async function safeFetch(start, { timeout = 8000, maxRedirects = 5, maxBytes = 2_000_000, method = 'GET' } = {}) {
  let cur = start; const t0 = Date.now();
  for (let i = 0; i <= maxRedirects; i++) {
    await assertPublicUrl(cur);
    const res = await fetch(cur, { method, redirect: 'manual', signal: AbortSignal.timeout(timeout), headers: { 'user-agent': 'GrowthoraAuditBot/1.0 (+https://growthora.co.in)' } });
    const loc = res.headers.get('location');
    if (res.status >= 300 && res.status < 400 && loc) { cur = new URL(loc, cur).href; continue; }
    let body = '', bytes = 0;
    if (method === 'GET' && res.body) {
      const reader = res.body.getReader(), chunks = [];
      for (;;) { const { done, value } = await reader.read(); if (done) break; bytes += value.length; if (bytes > maxBytes) { reader.cancel(); break; } chunks.push(value); }
      body = Buffer.concat(chunks).toString('utf8');
    }
    return { status: res.status, headers: res.headers, body, bytes, finalUrl: cur, ms: Date.now() - t0 };
  }
  throw new Error('Too many redirects');
}
