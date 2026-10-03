import app from './app.js';
import { env } from './config/env.js';
import { connectDB } from './config/db.js';
import { logger } from './utils/logger.js';
if (!env.jwtSecret || env.jwtSecret.startsWith('change_me')) { logger.error('Set a strong JWT_SECRET in .env'); process.exit(1); }
await connectDB();
app.listen(env.port, () => logger.info(`Growthora API running on :${env.port}`));
