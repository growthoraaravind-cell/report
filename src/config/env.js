import 'dotenv/config';
const configuredOrigins = [process.env.CLIENT_ORIGINS, process.env.VERCEL_PREVIEW_ORIGINS]
	.filter(Boolean)
	.flatMap((value) => value.split(','));
export const env = {
	port: process.env.PORT || 5000,
	mongo: process.env.MONGO_URI,
	jwtSecret: process.env.JWT_SECRET,
	origins: configuredOrigins.map((value) => value.trim()).filter(Boolean),
};
