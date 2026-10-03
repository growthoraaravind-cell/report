// Light-touch: refreshes Visitor.lastSeen when the SPA sends x-visitor-id. Full tracking lives in /track.
import Visitor from '../models/Visitor.js';
export const trackVisitor = (req, _res, next) => {
  const id = req.headers['x-visitor-id'];
  if (id && /^[\w-]{8,64}$/.test(id)) Visitor.updateOne({ visitorId: id }, { $set: { lastSeen: new Date() } }).catch(() => {});
  next();
};
export function parseUA(ua = '') {
  const device = /tablet|ipad/i.test(ua) ? 'Tablet' : /mobi|android|iphone/i.test(ua) ? 'Mobile' : 'Desktop';
  const browser = /edg\//i.test(ua) ? 'Edge' : /chrome|crios/i.test(ua) ? 'Chrome' : /firefox|fxios/i.test(ua) ? 'Firefox' : /safari/i.test(ua) ? 'Safari' : 'Other';
  const os = /windows/i.test(ua) ? 'Windows' : /android/i.test(ua) ? 'Android' : /iphone|ipad|ios/i.test(ua) ? 'iOS' : /mac os/i.test(ua) ? 'macOS' : /linux/i.test(ua) ? 'Linux' : 'Other';
  return { device, browser, os };
}
