import mongoose from 'mongoose';
import { env } from './env.js';
export const connectDB = async () => { mongoose.set('strictQuery', true); await mongoose.connect(env.mongo); console.log('MongoDB connected'); };
