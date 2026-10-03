import mongoose from 'mongoose';
import crypto from 'node:crypto';
const yn = { type: String, enum: ['Yes', 'No'], required: true };
export default mongoose.model('Submission', new mongoose.Schema({
  clientName: { type: String, required: true }, businessName: String, mobile: { type: String, match: /^[6-9]\d{9}$/, index: true }, email: String,
  entityType: String, businessStage: String, promoterCategory: String, sector: String, state: { type: String, index: true }, district: String,
  fundingPurpose: String, udyam: yn, dpiit: yn, gst: yn, iec: yn, gem: yn, fssai: yn,
  businessAge: Number, annualTurnover: Number, projectCost: Number,
  documents: [{ type: mongoose.Schema.Types.ObjectId, ref: 'FileAsset' }],
  website: String, social: { instagram: String, facebook: String, linkedin: String, youtube: String, x: String }, socialSelfReported: Object,
  resultSummary: Object, topSchemes: [Object], counts: { eligibleNow: Number, afterAction: Number, lowFit: Number },
  readinessFlags: Object, overallReadiness: Number, reportPdfUrl: String,
  status: { type: String, enum: ['New', 'Contacted', 'In-Progress', 'Converted', 'Closed'], default: 'New', index: true },
  assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' }, notes: [{ text: String, by: String, at: { type: Date, default: Date.now } }],
  visitorId: { type: String, index: true }, shareToken: { type: String, index: true, default: () => crypto.randomBytes(16).toString('hex') }, consent: { type: Boolean, required: true },
}, { timestamps: true }));
