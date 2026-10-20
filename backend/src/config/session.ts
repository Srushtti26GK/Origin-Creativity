import connectPgSimple from 'connect-pg-simple';
import session, { type Store } from 'express-session';
import { pool } from './database.js';
import { env } from './env.js';

if (Buffer.byteLength(env.sessionSecret) < 32) {
  throw new Error('SESSION_SECRET must be set to at least 32 random bytes.');
}

export const SESSION_COOKIE_NAME = 'origin.sid';
export const SESSION_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: env.nodeEnv === 'production',
  sameSite: 'lax' as const,
  path: '/',
  maxAge: 7 * 24 * 60 * 60 * 1000,
};

const PgSession = connectPgSimple(session);

export const postgresSessionStore = new PgSession({
  pool,
  tableName: 'session',
  createTableIfMissing: false,
  pruneSessionInterval: 15 * 60,
});

export function createSessionMiddleware(store: Store = postgresSessionStore) {
  return session({
    name: SESSION_COOKIE_NAME,
    secret: env.sessionSecret,
    store,
    resave: false,
    saveUninitialized: false,
    cookie: SESSION_COOKIE_OPTIONS,
    proxy: env.nodeEnv === 'production',
  });
}
