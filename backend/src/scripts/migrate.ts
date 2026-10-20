import { runner } from 'node-pg-migrate';
import { env } from '../config/env.js';
import { createSqlMigrationLoader } from './migrationLoader.js';

const direction = process.argv[2];

if (direction !== 'up' && direction !== 'down') {
  console.error('Choose a migration direction: up or down.');
  process.exit(1);
}

try {
  await runner({
    databaseUrl: {
      host: env.database.host,
      port: env.database.port,
      database: env.database.name,
      user: env.database.user,
      password: env.database.password,
    },
    dir: 'migrations',
    direction,
    count: direction === 'down' ? 1 : undefined,
    migrationsTable: 'pgmigrations',
    checkOrder: true,
    migrationLoaderStrategies: [{
      extensions: ['.sql'],
      loader: createSqlMigrationLoader(direction),
    }],
  });
  console.info(`Database migration ${direction} completed.`);
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Database migration failed: ${message}`);
  process.exitCode = 1;
}
