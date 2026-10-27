#!/usr/bin/env node
/**
 * Kelola user multi-akun.
 *   npm run user:add -- --name "Ani"
 *   npm run user:list
 */
import path from 'node:path';
import { loadConfig } from './config.js';
import { MAX_USERS, UserRegistry } from './users.js';

const args = process.argv.slice(2);
const cmd = args[0] || 'list';
const nameIdx = args.indexOf('--name');
const name = nameIdx >= 0 ? args[nameIdx + 1] : args[1];

let cfg;
try {
  cfg = loadConfig();
} catch (e) {
  // CLI list/add hanya butuh DATA_DIR + API_KEY; izinkan dry-run APNs kosong via env
  console.error(e.message);
  process.exit(1);
}

const registry = new UserRegistry({
  dataDir: path.resolve(cfg.dataDir),
  bootstrapApiKey: cfg.apiKey,
  log: console,
}).load();

if (cmd === 'list') {
  console.log(`\nUser (${registry.list().length}/${MAX_USERS}):\n`);
  for (const u of registry.list()) {
    const store = registry.getStore(u.id);
    const spotify = store?.get('refreshToken') ? 'Spotify ✓' : 'Spotify −';
    const devices = Array.isArray(store?.get('devices')) ? store.get('devices').length : 0;
    console.log(`  ${u.id}  ${u.name}  ${spotify}  devices=${devices}`);
  }
  console.log('');
  process.exit(0);
}

if (cmd === 'add') {
  try {
    const created = registry.addUser({ name: name || 'User' });
    console.log('\nUser baru dibuat. Simpan API key ini — hanya ditampilkan sekali:\n');
    console.log(`  id:      ${created.id}`);
    console.log(`  name:    ${created.name}`);
    console.log(`  apiKey:  ${created.apiKey}`);
    console.log('\nTempel apiKey di app (Status → API key) atau AppConfig.');
    console.log('Restart server agar engine user baru aktif.\n');
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
  process.exit(0);
}

console.error('Perintah: user:add | user:list');
process.exit(1);
