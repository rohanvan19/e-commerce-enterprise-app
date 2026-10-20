import https from 'node:https';
import http from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const COOKIE = '__Host-cocoa_phone';
const hopHeaders = ['connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization', 'te', 'trailer', 'transfer-encoding', 'upgrade'];
function equal(a, b) {
  const left = Buffer.from(a || '');
  const right = Buffer.from(b || '');
  return left.length === right.length && timingSafeEqual(left, right);
}
function stripHopHeaders(headers) {
  const copy = { ...headers };
  for (const key of [...hopHeaders, ...(headers.connection || '').toLowerCase().split(',').map(x => x.trim())]) delete copy[key];
  return copy;
}
export function createRelayHandler(config, backend = 'http://127.0.0.1:3000') {
  const publicURL = new URL(config.serverURL);
  const target = new URL(backend);
  if (publicURL.protocol !== 'https:' || !/^[a-f0-9]{64}$/.test(config.token)) throw new Error('Invalid iPhone connection settings');
  if (target.protocol !== 'http:' || target.hostname !== '127.0.0.1') throw new Error('The shop must remain on loopback');
  return (req, res) => {
    const reject = (code, message) => {
      if (res.headersSent) return res.destroy();
      res.writeHead(code, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' });
      res.end(message);
    };
    if (req.headers.host !== publicURL.host) return reject(403, 'Unrecognized shop host');
    if (req.headers.origin && req.headers.origin !== publicURL.origin) return reject(403, 'Cross-origin request rejected');
    if (req.headers['sec-fetch-site'] === 'cross-site') return reject(403, 'Cross-site request rejected');
    if (!req.url?.startsWith('/') || req.url.startsWith('//')) return reject(400, 'Invalid request path');
    if (req.url === '/_iphone/connect') {
      if (req.method !== 'GET' || !equal(req.headers['x-cocoa-pairing'], config.token)) return reject(401, 'Open the paired Cocoa Local iPhone app');
      res.writeHead(303, {
        location: '/', 'cache-control': 'no-store', 'referrer-policy': 'no-referrer',
        'set-cookie': COOKIE + '=' + config.token + '; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=2592000',
      });
      return res.end();
    }
    const cookies = (req.headers.cookie || '').split(';').map(x => x.trim());
    const credential = cookies.find(x => x.startsWith(COOKIE + '='))?.slice(COOKIE.length + 1);
    if (!equal(credential, config.token)) return reject(401, 'Open the paired Cocoa Local iPhone app');
    const headers = stripHopHeaders(req.headers);
    for (const key of Object.keys(headers)) {
      if (key === 'forwarded' || key.startsWith('x-forwarded-') || key === 'x-cocoa-pairing') delete headers[key];
    }
    headers.host = target.host;
    headers.cookie = cookies.filter(x => !x.startsWith(COOKIE + '=')).join('; ');
    if (headers.origin) headers.origin = target.origin;
    if (headers.referer) headers.referer = target.origin + '/';
    const upstream = http.request({ hostname: target.hostname, port: target.port, path: req.url, method: req.method, headers }, response => {
      clearTimeout(timer);
      const responseHeaders = stripHopHeaders(response.headers);
      if (responseHeaders['set-cookie']) responseHeaders['set-cookie'] = responseHeaders['set-cookie'].map(value => /;\s*Secure(?:;|$)/i.test(value) ? value : value + '; Secure');
      if (responseHeaders.location?.startsWith(target.origin + '/')) responseHeaders.location = publicURL.origin + responseHeaders.location.slice(target.origin.length);
      res.writeHead(response.statusCode || 502, responseHeaders);
      response.pipe(res);
      response.on('error', () => res.destroy());
    });
    const timer = setTimeout(() => upstream.destroy(new Error('Shop response timeout')), 30000);
    upstream.on('error', () => { clearTimeout(timer); if (!res.writableEnded) reject(502, 'The PC shop server is unavailable. Start the shop and retry.'); });
    let bytes = 0;
    req.on('data', chunk => {
      bytes += chunk.length;
      if (bytes > 6 * 1024 * 1024) { reject(413, 'Upload exceeds 6 MB'); upstream.destroy(); }
    });
    req.on('aborted', () => upstream.destroy());
    res.on('close', () => { clearTimeout(timer); upstream.destroy(); });
    req.pipe(upstream);
  };
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const directory = resolve('.iphone');
  const config = JSON.parse(readFileSync(resolve(directory, 'connection.json'), 'utf8'));
  const url = new URL(config.serverURL);
  const server = https.createServer({
    key: readFileSync(resolve(directory, 'server-key.pem')),
    cert: readFileSync(resolve(directory, 'server-cert.pem')),
    minVersion: 'TLSv1.2',
  }, createRelayHandler(config));
  server.on('upgrade', (_, socket) => socket.destroy());
  server.on('error', error => { console.error('iPhone relay:', error.message); process.exitCode = 1; });
  server.listen(Number(url.port || 443), url.hostname, () => console.log('Cocoa Local iPhone connection: ' + url.origin + '\nKeep this process and the local shop running.'));
}

