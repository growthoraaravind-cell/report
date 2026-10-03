import crypto from 'node:crypto';
import { z } from 'zod';
import Visitor from '../models/Visitor.js';
import PageView from '../models/PageView.js';
import { parseUA } from '../middlewares/trackVisitor.js';
import { env } from '../config/env.js';
import { wrap } from '../utils/apiResponse.js';
let geo = null; try { geo = (await import('geoip-lite')).default; } catch { /* optional dependency */ }
export const TYPES = ['session_start', 'page_view', 'cta_click', 'eligibility_started', 'wizard_step', 'submission_completed', 'report_viewed', 'report_downloaded', 'chat_opened', 'contact_click'];
export const trackSchema = z.object({ visitorId: z.string().regex(/^[\w-]{8,64}$/), type: z.enum(TYPES), path: z.string().max(300).optional(), meta: z.record(z.any()).optional(), referrer: z.string().max(300).optional(), utm: z.record(z.string().max(100)).optional() });
export const track = wrap(async (req, res) => {
  const b = req.body, ip = req.ip || '', g = geo?.lookup(ip);
  const inc = { totalPageViews: b.type === 'page_view' ? 1 : 0, totalSessions: b.type === 'session_start' ? 1 : 0 };
  let source = 'Direct'; try { if (b.utm?.utm_source) source = b.utm.utm_source; else if (b.referrer) source = new URL(b.referrer).hostname.replace(/^www\./, ''); } catch { /* keep Direct */ }
  await Visitor.updateOne({ visitorId: b.visitorId }, { $setOnInsert: { firstSeen: new Date(), ...parseUA(req.headers['user-agent']), ipHash: crypto.createHash('sha256').update(ip + env.jwtSecret).digest('hex').slice(0, 16), city: g?.city, state: g?.region, referrer: source, utm: b.utm }, $set: { lastSeen: new Date() }, $inc: inc }, { upsert: true });
  await PageView.create({ visitorId: b.visitorId, type: b.type, path: b.path, meta: b.meta });
  res.status(204).end();
});
