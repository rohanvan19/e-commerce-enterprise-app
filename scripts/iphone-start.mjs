import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
process.chdir(fileURLToPath(new URL('../', import.meta.url)));
if (!existsSync('.iphone/connection.json')) throw new Error('Run the WSL iPhone setup script first. See ios/README.md.');
const db = spawnSync(process.execPath, ['scripts/local-db.mjs'], { stdio: 'inherit', windowsHide: true });
if (db.status !== 0) process.exit(db.status || 1);
const children = [];
let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) child.kill();
  process.exitCode = code;
}
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => stop());
function launch(args) {
  const child = spawn(process.execPath, args, { stdio: 'inherit', windowsHide: true });
  children.push(child);
  child.on('error', error => { console.error(error.message); stop(1); });
  child.on('exit', code => { if (!stopping) stop(code || 0); });
  return child;
}
async function shopReady() {
  try {
    const response = await fetch('http://127.0.0.1:3000/api/state', { signal: AbortSignal.timeout(1500) });
    const data = await response.json();
    if (response.ok && data.mode === 'local' && Array.isArray(data.products)) return true;
    throw new Error('Port 3000 is occupied by an unexpected server.');
  } catch (error) {
    if (error.message.includes('unexpected server')) throw error;
    return false;
  }
}
if (!await shopReady()) {
  if (!existsSync('.next/BUILD_ID')) throw new Error('Build the shop first: npm run build');
  launch([resolve('node_modules/next/dist/bin/next'), 'start', '--hostname', '127.0.0.1', '--port', '3000']);
  let ready = false;
  for (let attempt = 0; attempt < 60 && !stopping; attempt++) {
    if (await shopReady()) { ready = true; break; }
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  if (!ready) { console.error('Shop did not start. Check the output above.'); stop(1); }
} else {
  console.log('Reusing the running Cocoa Local shop on port 3000.');
}
if (!stopping) launch(['scripts/iphone-relay.mjs']);

