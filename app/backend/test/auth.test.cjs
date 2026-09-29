const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { OAuth2Client } = require('google-auth-library');
process.env.GOOGLE_CLIENT_ID = 'test-client';
process.env.FRONTEND_ORIGIN = 'http://localhost:4200';
process.env.NODE_ENV = 'test';
const originalVerify = OAuth2Client.prototype.verifyIdToken;
OAuth2Client.prototype.verifyIdToken = async ({ idToken, audience }) => {
  assert.equal(audience, 'test-client');
  if (idToken === 'invalid') throw new Error('Invalid signature or expired token');
  return { getPayload: () => ({ sub: 'google-user-123', email: 'person@gmail.com',
    name: 'Test User', email_verified: idToken !== 'unverified' }) };
};
const app = require('../dist/app').default;
let server, base;
before(async () => {
  await new Promise(resolve => { server = app.listen(0, '127.0.0.1', resolve); });
  base = `http://127.0.0.1:${server.address().port}/api/auth`;
});
after(async () => {
  OAuth2Client.prototype.verifyIdToken = originalVerify;
  await new Promise(resolve => server.close(resolve));
});
function post(path, body, headers = {}) {
  return fetch(base + path, { method: 'POST', headers: {
    'Content-Type': 'application/json', Origin: process.env.FRONTEND_ORIGIN, ...headers
  }, body: JSON.stringify(body) });
}
test('requires an authenticated session', async () => {
  assert.equal((await fetch(base + '/me')).status, 401);
});
test('rejects invalid credentials, unverified email, and foreign origins', async () => {
  assert.equal((await post('/google', {})).status, 400);
  assert.equal((await post('/google', { credential: 'invalid' })).status, 401);
  assert.equal((await post('/google', { credential: 'unverified' })).status, 403);
  assert.equal((await post('/google', { credential: 'valid' }, { Origin: 'https://other.example' })).status, 403);
});
test('accepts Gmail, restores session, and invalidates it on logout', async () => {
  const login = await post('/google', { credential: 'valid' });
  assert.equal(login.status, 200);
  const cookieHeader = login.headers.get('set-cookie');
  assert.match(cookieHeader, /HttpOnly/);
  assert.match(cookieHeader, /SameSite=Lax/i);
  const cookie = cookieHeader.split(';')[0];
  const current = await fetch(base + '/me', { headers: { Cookie: cookie } });
  assert.equal((await current.json()).user.email, 'person@gmail.com');
  assert.equal((await post('/logout', {}, { Cookie: cookie })).status, 204);
  assert.equal((await fetch(base + '/me', { headers: { Cookie: cookie } })).status, 401);
});
