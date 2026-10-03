import cors from 'cors';
import { env } from './env.js';
export function normalizeOrigin(value) {
	try { return new URL(String(value).trim()).origin; }
	catch { return ''; }
}

const allowedOrigins = new Set(env.origins.map(normalizeOrigin).filter(Boolean));

export default cors({
	origin: (origin, callback) => {
		if (!origin || allowedOrigins.has(normalizeOrigin(origin))) return callback(null, true);
		return callback(new Error(`Origin not allowed: ${origin}`));
	},
	credentials: true,
});
