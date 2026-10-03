import mongoose from 'mongoose';
export default mongoose.model('DigitalAudit', new mongoose.Schema({
  submissionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Submission', index: true }, visitorId: { type: String, index: true },
  websiteUrl: String, websiteScore: { type: Number, index: true }, socialScore: { type: Number, index: true },
  website: Object, social: Object, recommendations: [Object],
}, { timestamps: true }));
