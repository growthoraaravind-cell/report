import mongoose from 'mongoose';
export default mongoose.model('Lookup', new mongoose.Schema({ key: { type: String, unique: true, index: true }, label: String, values: [String] }, { timestamps: true }));
