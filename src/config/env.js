import 'dotenv/config';
export const env = { port: process.env.PORT || 5000, mongo: process.env.MONGO_URI, jwtSecret: process.env.JWT_SECRET, origins: (process.env.CLIENT_ORIGINS || '').split(',') };
