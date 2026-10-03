import crypto from 'node:crypto';
import { z } from 'zod';
import ChatSession from '../models/ChatSession.js';
import ChatMessage from '../models/ChatMessage.js';
import ContactRequest from '../models/ContactRequest.js';
import Submission from '../models/Submission.js';
import { chatReply, QUICK_REPLIES } from '../services/chat.service.js';
import { ok, wrap } from '../utils/apiResponse.js';
export const messageSchema = z.object({ sessionId: z.string().max(64).optional(), visitorId: z.string().max(64).optional(), message: z.string().trim().min(1).max(1000), submissionToken: z.string().optional() });
export const handoffSchema = z.object({ sessionId: z.string().max(64), name: z.string().trim().min(2).max(100), phone: z.string().regex(/^[6-9]\d{9}$/, 'Enter a valid 10-digit mobile number') });
export const sendMessage = wrap(async (req, res) => {
  const b = req.body; let session = b.sessionId && await ChatSession.findOne({ sessionId: b.sessionId });
  const sub = b.submissionToken ? await Submission.findOne({ shareToken: b.submissionToken }).select('clientName counts topSchemes readinessFlags overallReadiness').lean() : null;
  if (!session) session = await ChatSession.create({ sessionId: crypto.randomUUID(), visitorId: b.visitorId, submissionId: sub?._id });
  const history = (await ChatMessage.find({ sessionId: session.sessionId }).sort({ createdAt: -1 }).limit(10).lean()).reverse().map((m) => ({ role: m.role, content: m.content }));
  await ChatMessage.create({ sessionId: session.sessionId, role: 'user', content: b.message });
  const ctx = sub && { name: sub.clientName, counts: sub.counts, readiness: sub.overallReadiness, flags: sub.readinessFlags, topSchemes: (sub.topSchemes || []).slice(0, 5).map((t) => `${t.name} (${t.status})`) };
  const { reply, source } = await chatReply({ history, message: b.message, context: ctx });
  await ChatMessage.create({ sessionId: session.sessionId, role: 'assistant', content: reply, source });
  await ChatSession.updateOne({ _id: session._id }, { $inc: { messageCount: 2 } });
  ok(res, { sessionId: session.sessionId, reply, source, quickReplies: QUICK_REPLIES });
});
export const handoff = wrap(async (req, res) => {
  const { sessionId, name, phone } = req.body;
  await ChatSession.updateOne({ sessionId }, { name, phone, handoff: true });
  await ContactRequest.create({ name, mobile: phone, type: 'chat-handoff', message: 'Requested a human from chat. Session ' + sessionId });
  ok(res, { whatsapp: 'https://wa.me/916360886843', phone: '+91 6360886843', email: 'info@growthora.co.in' }, 'Our team will contact you shortly');
});
export const history = wrap(async (req, res) => ok(res, await ChatMessage.find({ sessionId: String(req.params.sessionId) }).sort({ createdAt: 1 }).select('role content createdAt').lean()));
