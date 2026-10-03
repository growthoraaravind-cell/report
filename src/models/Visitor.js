import mongoose from 'mongoose';
export default mongoose.model('Visitor', new mongoose.Schema({
  visitorId: { type: String, unique: true, index: true }, firstSeen: Date, lastSeen: { type: Date, index: true },
  device: String, browser: String, os: String, ipHash: String, city: String, state: String, referrer: String, utm: Object,
  totalSessions: { type: Number, default: 0 }, totalPageViews: { type: Number, default: 0 },
  converted: { type: Boolean, default: false, index: true }, submissionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Submission' },
}, { timestamps: true }));
