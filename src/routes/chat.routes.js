import { Router } from 'express';
import * as c from '../controllers/chat.controller.js';
import { validate } from '../middlewares/validate.js';
import { chatLimiter } from '../middlewares/rateLimit.js';
const r = Router();
r.post('/message', chatLimiter, validate(c.messageSchema), c.sendMessage);
r.post('/handoff', chatLimiter, validate(c.handoffSchema), c.handoff);
r.get('/history/:sessionId', c.history);
export default r;
