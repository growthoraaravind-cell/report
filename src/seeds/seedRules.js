import mongoose from 'mongoose';
import { connectDB } from '../config/db.js';
import RuleSetting, { DEFAULT_RULES } from '../models/RuleSetting.js';
await connectDB();
await RuleSetting.findOneAndUpdate({ key: 'default' }, { key: 'default', value: DEFAULT_RULES }, { upsert: true });
console.log('Default rules seeded'); await mongoose.disconnect();
