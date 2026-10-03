import mongoose from 'mongoose';
export default mongoose.model('ChatSession', new mongoose.Schema({ sessionId: { type: String, unique: true, index: true }, visitorId: { type: String, index: true }, submissionId: mongoose.Schema.Types.ObjectId, name: String, phone: String, handoff: { type: Boolean, default: false }, messageCount: { type: Number, default: 0 } }, { timestamps: true }));
