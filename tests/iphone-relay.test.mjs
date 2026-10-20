import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { once } from 'node:events';
import { createRelayHandler } from '../scripts/iphone-relay.mjs';

const token = 'a'.repeat(64);
const config = { serverURL: 'https://192.168.1.2:3443', token };
const host = '192.168.1.2:3443';
let relay, backend, port;
const seen = [];
before(async () => {
  backend = http.createServer((req, res) => {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', () => {
      seen.push({ path: req.url, headers: req.headers, body });
      res.writeHead(200, { 'content-type': 'application/json', 'set-cookie': 'session=example; HttpOnly; SameSite=Lax' });
      res.end(JSON.stringify({ path: req.url, headers: req.headers, body }));
    });
  }).listen(0, '127.0.0.1');
  await once(backend, 'listening');
  relay = http.createServer(createRelayHandler(config, 'http://127.0.0.1:' + backend.address().port)).listen(0, '127.0.0.1');
  await once(relay, 'listening'); port = relay.address().port;
});
after(async () => { await Promise.all([new Promise(r => relay.close(r)), new Promise(r => backend.close(r))]); });
function request(path = '/', headers = {}, method = 'GET', body = '') {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, path, method, headers: { host, ...headers } }, res => {
      let text = ''; res.on('data', c => text += c); res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, text }));
    });
    req.on('error', reject); req.end(body);
  });
}
const paired = { cookie: '__Host-cocoa_phone=' + token };
test('all shop routes require pairing before reaching the backend', async () => {
  const count = seen.length;
  for (const path of ['/', '/api/state', '/api/mail', '/admin', '/_next/static/test.js']) assert.equal((await request(path)).status, 401);
  assert.equal(seen.length, count);
});
test('pairing validates the secret and sets a secure HttpOnly strict host cookie', async () => {
  assert.equal((await request('/_iphone/connect', { 'x-cocoa-pairing': 'wrong' })).status, 401);
  const result = await request('/_iphone/connect', { 'x-cocoa-pairing': token });
  assert.equal(result.status, 303); assert.equal(result.headers.location, '/');
  assert.match(result.headers['set-cookie'][0], /HttpOnly; Secure; SameSite=Strict/);
  assert.equal((await request('/_iphone/connect', { 'x-cocoa-pairing': token }, 'POST')).status, 401);
});
test('rejects unknown hosts, cross-site requests and foreign origins even with a valid cookie', async () => {
  for (const headers of [{ host: 'evil.example' }, { origin: 'https://evil.example' }, { 'sec-fetch-site': 'cross-site' }]) {
    assert.equal((await request('/api/state', { ...paired, ...headers })).status, 403);
  }
});
test('forwards authorized JSON while preserving paths and app cookies, stripping pairing and proxy spoofing', async () => {
  const result = await request('/api/cart?test=1', {
    ...paired, cookie: paired.cookie + '; session=abc', origin: config.serverURL,
    'content-type': 'application/json', 'x-forwarded-host': 'evil.example',
    'forwarded': 'host=evil.example', 'x-cocoa-pairing': token
  }, 'POST', '{"quantity":2}');
  assert.equal(result.status, 200);
  const data = JSON.parse(result.text);
  assert.equal(data.path, '/api/cart?test=1');
  assert.equal(data.body, '{"quantity":2}');
  assert.equal(data.headers.cookie, 'session=abc');
  assert.equal(data.headers.origin, 'http://127.0.0.1:' + backend.address().port);
  assert.equal(data.headers['x-forwarded-host'], undefined);
  assert.equal(data.headers.forwarded, undefined);
  assert.equal(data.headers['x-cocoa-pairing'], undefined);
  assert.match(result.headers['set-cookie'][0], /; Secure$/);
});
test('cannot act as an open proxy', async () => {
  assert.equal((await request('//evil.example/api', paired)).status, 400);
  assert.throws(() => createRelayHandler(config, 'http://evil.example:3000'));
});
test('returns a controlled error when the shop is offline', async () => {
  const unused = http.createServer().listen(0, '127.0.0.1'); await once(unused, 'listening');
  const unusedPort = unused.address().port; await new Promise(r => unused.close(r));
  const deadRelay = http.createServer(createRelayHandler(config, 'http://127.0.0.1:' + unusedPort)).listen(0, '127.0.0.1');
  await once(deadRelay, 'listening');
  const original = port; port = deadRelay.address().port;
  try { assert.equal((await request('/', paired)).status, 502); }
  finally { port = original; await new Promise(r => deadRelay.close(r)); }
});

