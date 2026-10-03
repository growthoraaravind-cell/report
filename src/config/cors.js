import cors from 'cors';
import { env } from './env.js';
export default cors({ origin: (o, cb) => (!o || env.origins.includes(o) ? cb(null, true) : cb(new Error('Origin not allowed'))), credentials: true });
