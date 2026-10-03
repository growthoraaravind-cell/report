export const ok = (res, data = null, message = 'OK', meta) => res.json({ success: true, message, data, meta });
export const fail = (res, status, message, errors) => res.status(status).json({ success: false, message, data: null, meta: errors ? { errors } : undefined });
export const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
export const paging = (q) => {
  const page = Math.max(1, +q.page || 1), limit = Math.min(100, Math.max(1, +q.limit || 20));
  const sf = String(q.sort || '-createdAt');
  return { page, limit, skip: (page - 1) * limit, sort: { [sf.replace(/^-/, '')]: sf.startsWith('-') ? -1 : 1 } };
};
export const escapeRx = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
