import { pool } from '../config/database.js';

async function inspect() {
  try {
    const dbRes = await pool.query<{ current_db: string; current_schema: string }>(
      'SELECT current_database() AS current_db, current_schema() AS current_schema'
    );
    console.log('Database Info:', dbRes.rows[0]);

    const tables = await pool.query<{ table_schema: string; table_name: string }>(
      "SELECT table_schema, table_name FROM information_schema.tables WHERE table_schema NOT IN ('pg_catalog', 'information_schema') ORDER BY table_schema, table_name"
    );
    console.log('Existing tables:');
    for (const t of tables.rows) {
      console.log(` - ${t.table_schema}.${t.table_name}`);
    }

    const migExists = await pool.query<{ exists: boolean }>(
      "SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'pgmigrations') AS exists"
    );
    if (migExists.rows[0].exists) {
      const migrations = await pool.query('SELECT * FROM pgmigrations ORDER BY id');
      console.log('Applied pgmigrations:', migrations.rows);
    } else {
      console.log('pgmigrations table does not exist yet.');
    }
  } catch (err) {
    console.error('Inspection error:', err);
  } finally {
    await pool.end();
  }
}

inspect();
