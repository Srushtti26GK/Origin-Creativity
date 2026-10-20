import { readFile } from 'node:fs/promises';

export type MigrationDirection = 'up' | 'down';

export function createSqlMigrationLoader(direction: MigrationDirection) {
  const suffix = `.${direction}.sql`;

  return async (filePaths: string[]) => {
    const selectedFilePaths = filePaths.filter((filePath) => filePath.endsWith(suffix));
    const migrations = [];

    for (const filePath of selectedFilePaths) {
      const sql = await readFile(filePath, 'utf8');
      const id = filePath.slice(0, -suffix.length) + '.sql';
      migrations.push({
        id,
        filePaths: [filePath],
        actions: {
          [direction]: (pgm: { sql: (statement: string) => void }) => pgm.sql(sql),
        },
      });
    }

    return migrations;
  };
}
