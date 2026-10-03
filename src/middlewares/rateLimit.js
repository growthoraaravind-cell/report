import rateLimit from 'express-rate-limit';
const mk = (windowMs, limit, message) => rateLimit({ windowMs, limit, standardHeaders: true, legacyHeaders: false, handler: (_q, res) => res.status(429).json({ success: false, message, data: null }) });
export const apiLimiter = mk(60_000, 300, 'Too many requests - please try again in a minute');
export const loginLimiter = mk(15 * 60_000, 10, 'Too many sign-in attempts - please try again later');
export const submitLimiter = mk(60 * 60_000, 30, 'Submission limit reached - please try again later or call us');
export const uploadLimiter = mk(60 * 60_000, 60, 'Upload limit reached - please try again later');
export const chatLimiter = mk(60_000, 20, 'Please slow down a little');
