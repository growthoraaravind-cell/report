import mongoose from 'mongoose';
import { DEFAULT_RULES } from '../config/defaultRules.js';
export { DEFAULT_RULES };
export default mongoose.model('RuleSetting', new mongoose.Schema({ key: { type: String, default: 'default', unique: true }, value: { type: Object, default: DEFAULT_RULES } }, { timestamps: true }));
