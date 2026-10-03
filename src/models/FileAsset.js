import mongoose from 'mongoose';
// Files live on disk under /server/uploads; only url + metadata are stored here (no Base64).
export default mongoose.model('FileAsset', new mongoose.Schema({
  url: { type: String, required: true }, path: String, originalName: String, mimeType: String, size: Number,
  kind: { type: String, enum: ['document', 'image', 'video', 'report', 'logo', 'misc'], index: true },
  ownerType: String, ownerId: { type: mongoose.Schema.Types.ObjectId, index: true },
}, { timestamps: { createdAt: 'uploadedAt', updatedAt: false } }));
