import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import { connectDB } from '../config/db.js';
import Admin from '../models/Admin.js';
await connectDB();
const email = process.env.SEED_ADMIN_EMAIL || 'admin@gmail.com';
await Admin.findOneAndUpdate({ email }, { name: 'Growthora Admin', email, passwordHash: await bcrypt.hash(process.env.SEED_ADMIN_PASSWORD || '123456', 12), role: 'superadmin' }, { upsert: true });
console.log('Admin seeded:', email, '- CHANGE THE PASSWORD BEFORE PRODUCTION'); await mongoose.disconnect();
