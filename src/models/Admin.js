import mongoose from 'mongoose';
export default mongoose.model('Admin', new mongoose.Schema({ name: String, email: { type: String, unique: true, lowercase: true }, passwordHash: { type: String, select: false }, role: { type: String, default: 'admin' }, lastLoginAt: Date }, { timestamps: true }));
