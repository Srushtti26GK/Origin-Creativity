import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import type { AddressInfo } from 'node:net';

process.env.NODE_ENV = 'test';
process.env.PORT = '4000';
process.env.FRONTEND_ORIGINS = 'http://localhost:5173';
process.env.SESSION_SECRET = 'health-test-secret-value-at-least-32-bytes';
process.env.DB_HOST = '127.0.0.1';
process.env.DB_PORT = '1';
process.env.DB_NAME = 'health_test';
process.env.DB_USER = 'health_test';
process.env.DB_PASSWORD = 'health_test';

const [{ app }, { pool }] = await Promise.all([
  import('../src/app.js'),
  import('../src/config/database.js'),
]);
const { postgresSessionStore } = await import('../src/config/session.js');

let server: ReturnType<typeof app.listen>;
let baseUrl: string;

before(async () => {
  server = app.listen(0);
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const { port } = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${port}`;
});

after(async () => {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
  postgresSessionStore.close();
  await pool.end();
});

test('GET /api/health reports that the backend is running', async () => {
  const response = await fetch(`${baseUrl}/api/health`);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { status: 'ok' });
});

test('CORS allows the configured frontend origin with credentials only', async () => {
  const allowedResponse = await fetch(`${baseUrl}/api/health`, {
    headers: { Origin: 'http://localhost:5173' },
  });
  assert.equal(allowedResponse.headers.get('access-control-allow-origin'), 'http://localhost:5173');
  assert.equal(allowedResponse.headers.get('access-control-allow-credentials'), 'true');

  const disallowedResponse = await fetch(`${baseUrl}/api/health`, {
    headers: { Origin: 'http://untrusted.test' },
  });
  assert.equal(disallowedResponse.headers.get('access-control-allow-origin'), null);
});

test('GET /api/health/db reports database failures without internal details', async () => {
  const response = await fetch(`${baseUrl}/api/health/db`);
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), {
    status: 'error',
    message: 'Database unavailable',
  });
});
