import 'dotenv/config';

function required(name: string, fallback?: string): string {
  const v = process.env[name] ?? fallback;
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

export const env = {
  PORT: Number(process.env.PORT ?? 4000),
  HOST: process.env.HOST ?? '0.0.0.0',
  NODE_ENV: process.env.NODE_ENV ?? 'development',
  SESSION_SECRET: required('SESSION_SECRET', 'dev-only-change-me'),
  SESSION_DAYS: Number(process.env.SESSION_DAYS ?? 90),
  RESEND_API_KEY: process.env.RESEND_API_KEY ?? '',
  RESEND_FROM: process.env.RESEND_FROM ?? 'Family Asana <no-reply@example.com>',
  APP_URL: process.env.APP_URL ?? 'http://localhost:5173',
  ALLOWED_EMAILS: (process.env.ALLOWED_EMAILS ?? '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean),
};

export const isDev = env.NODE_ENV !== 'production';
