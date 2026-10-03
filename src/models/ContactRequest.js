import mongoose from 'mongoose';
export default mongoose.model('ContactRequest', new mongoose.Schema({
  name: String, mobile: { type: String, match: /^[6-9]\d{9}$/ }, email: String, message: String,
  type: { type: String, enum: ['callback', 'enquiry', 'chat-handoff'], default: 'enquiry' },
  status: { type: String, enum: ['New', 'Contacted', 'Closed'], default: 'New', index: true },
  submissionId: mongoose.Schema.Types.ObjectId, visitorId: { type: String, index: true },
}, { timestamps: true }));
