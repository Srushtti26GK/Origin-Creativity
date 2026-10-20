import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { createSqlMigrationLoader } from '../src/scripts/migrationLoader.js';

test('up loader selects and executes only up SQL files in the supplied order', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'origin-migrations-'));

  try {
    const firstUp = join(directory, '001_first.up.sql');
    const firstDown = join(directory, '001_first.down.sql');
    const secondUp = join(directory, '002_second.up.sql');
    const firstUpSql = [
      'CREATE TABLE first_table (id UUID PRIMARY KEY);',
      'CREATE INDEX first_table_id_idx ON first_table (id);',
    ].join('\n');
    const secondUpSql = 'CREATE TABLE second_table (id UUID PRIMARY KEY);';

    await Promise.all([
      writeFile(firstUp, firstUpSql),
      writeFile(secondUp, secondUpSql),
    ]);

    const loader = createSqlMigrationLoader('up');
    const migrations = await loader([firstUp, firstDown, secondUp]);

    assert.deepEqual(migrations.map(({ id }) => id), [
      firstUp.slice(0, -'.up.sql'.length) + '.sql',
      secondUp.slice(0, -'.up.sql'.length) + '.sql',
    ]);

    const executedSql: string[] = [];
    for (const migration of migrations) {
      assert.equal(migration.actions.down, undefined);
      migration.actions.up?.({ sql: (statement) => executedSql.push(statement) });
    }

    assert.deepEqual(executedSql, [firstUpSql, secondUpSql]);
    await assert.rejects(readFile(firstDown, 'utf8'), { code: 'ENOENT' });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('down loader selects and executes down SQL files only for rollback', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'origin-migrations-'));

  try {
    const upFile = join(directory, '001_first.up.sql');
    const downFile = join(directory, '001_first.down.sql');
    const upSql = 'CREATE TABLE first_table (id UUID PRIMARY KEY);';
    const downSql = 'DROP TABLE first_table;';

    await Promise.all([
      writeFile(upFile, upSql),
      writeFile(downFile, downSql),
    ]);

    const loader = createSqlMigrationLoader('down');
    const migrations = await loader([upFile, downFile]);

    assert.equal(migrations.length, 1);
    assert.equal(migrations[0].id, upFile.slice(0, -'.up.sql'.length) + '.sql');
    assert.equal(migrations[0].actions.up, undefined);

    const executedSql: string[] = [];
    migrations[0].actions.down?.({ sql: (statement) => executedSql.push(statement) });

    assert.deepEqual(executedSql, [downSql]);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
