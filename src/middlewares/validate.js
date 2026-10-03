export const validate = (schema, src = 'body') => (req, _res, next) => {
  const r = schema.safeParse(req[src]);
  if (!r.success) return next(Object.assign(new Error('Please check the highlighted fields'), { status: 400, errors: r.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })) }));
  req[src] = r.data; next();
};
// NoSQL-injection guard: drop keys starting with "$" or containing "."
const clean = (o) => { if (o && typeof o === 'object') for (const k of Object.keys(o)) { if (k.startsWith('$') || k.includes('.')) delete o[k]; else clean(o[k]); } return o; };
export const sanitize = (req, _res, next) => { clean(req.body); clean(req.params); clean(req.query); next(); };
