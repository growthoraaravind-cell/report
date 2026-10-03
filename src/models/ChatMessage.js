import mongoose from 'mongoose';
export default mongoose.model('ChatMessage', new mongoose.Schema({ sessionId: { type: String, index: true }, role: { type: String, enum: ['user', 'assistant'] }, content: String, source: String, createdAt: { type: Date, default: Date.now } }));
