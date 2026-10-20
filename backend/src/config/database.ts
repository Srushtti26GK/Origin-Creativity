import pg from 'pg';
import { env } from './env.js';

const { Pool } = pg;

export const pool = new Pool({
  host: env.database.host,
  port: env.database.port,
  database: env.database.name,
  user: env.database.user,
  password: env.database.password,
  connectionTimeoutMillis: 3000,
  idleTimeoutMillis: 30_000,
  max: 10,
});

pool.on('error', () => {
  console.error('Unexpected error from an idle PostgreSQL client.');
});
