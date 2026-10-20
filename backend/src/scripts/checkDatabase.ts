import { pool } from '../config/database.js';

try {
  const result = await pool.query<{ database_name: string }>(
    'SELECT current_database() AS database_name',
  );
  console.info(`Connected to PostgreSQL database "${result.rows[0].database_name}".`);
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Could not connect to PostgreSQL: ${message}`);
  process.exitCode = 1;
} finally {
  await pool.end();
}
