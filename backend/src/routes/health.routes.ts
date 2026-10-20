import { Router } from 'express';
import { pool } from '../config/database.js';

export const healthRouter = Router();

healthRouter.get('/', (_request, response) => {
  response.status(200).json({ status: 'ok' });
});

healthRouter.get('/db', async (_request, response) => {
  try {
    await pool.query('SELECT 1');
    response.status(200).json({ status: 'ok', database: 'connected' });
  } catch {
    console.error('PostgreSQL health check failed.');
    response.status(503).json({ status: 'error', message: 'Database unavailable' });
  }
});
