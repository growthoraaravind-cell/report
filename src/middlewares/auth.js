import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import Admin from '../models/Admin.js';
import { fail, wrap } from '../utils/apiResponse.js';
export const signToken = (a) => jwt.sign({ id: a._id, role: a.role }, env.jwtSecret, { expiresIn: process.env.JWT_EXPIRES_IN || '1d' });
export const requireAdmin = wrap(async (req, res, next) => {
  const t = req.headers.authorization?.replace(/^Bearer /, '') || req.cookies?.token;
  if (!t) return fail(res, 401, 'Please sign in to continue');
  try { req.admin = await Admin.findById(jwt.verify(t, env.jwtSecret).id); } catch { req.admin = null; }
  if (!req.admin) return fail(res, 401, 'Your session has expired. Please sign in again');
  next();
});
