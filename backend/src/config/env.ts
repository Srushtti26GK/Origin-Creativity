import 'dotenv/config';

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function positiveInteger(name: string, value: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer.`);
  }
  return parsed;
}

const frontendOrigins = required('FRONTEND_ORIGINS')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

if (frontendOrigins.length === 0) {
  throw new Error('FRONTEND_ORIGINS must contain at least one origin.');
}

export const env = {
  nodeEnv: process.env.NODE_ENV?.trim() || 'development',
  port: positiveInteger('PORT', process.env.PORT?.trim() || '4000'),
  frontendOrigins,
  sessionSecret: process.env.SESSION_SECRET?.trim() || '',
  cloudinary: {
    cloudName: process.env.CLOUDINARY_CLOUD_NAME?.trim() || '',
    apiKey: process.env.CLOUDINARY_API_KEY?.trim() || '',
    apiSecret: process.env.CLOUDINARY_API_SECRET?.trim() || '',
  },
  database: {
    host: process.env.DB_HOST?.trim() || 'localhost',
    port: positiveInteger('DB_PORT', process.env.DB_PORT?.trim() || '5432'),
    name: process.env.DB_NAME?.trim() || 'creative_community',
    user: required('DB_USER'),
    password: required('DB_PASSWORD'),
  },
} as const;
