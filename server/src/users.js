import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { Store } from './store.js';

export const MAX_USERS = 5;

export function hashApiKey(key) {
  return crypto.createHash('sha256').update(String(key), 'utf8').digest('hex');
}

export function generateApiKey() {
  return crypto.randomBytes(24).toString('hex');
}

export function generateUserId(name = 'user') {
  const slug = String(name)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 16);
  const suffix = crypto.randomBytes(3).toString('hex');
  return slug ? `${slug}-${suffix}` : suffix;
}

/** Ubah state lama (activity/deviceToken tunggal) → devices[]. */
export function migrateUserDataShape(data, now = Date.now()) {
  const out = { ...data };
  if (Array.isArray(out.devices)) return out;

  const devices = [];
  const activity = out.activity;
  const deviceToken = out.deviceToken || null;
  const pushToStartToken = out.pushToStartToken || null;
  if (activity?.token || deviceToken || pushToStartToken) {
    devices.push({
      deviceId: 'migrated',
      activityToken: activity?.token ?? null,
      activityId: activity?.id ?? null,
      deviceToken,
      pushToStartToken,
      registeredAtMs: activity?.registeredAtMs ?? now,
      lastSeenAt: now,
    });
  }
  delete out.activity;
  delete out.deviceToken;
  delete out.pushToStartToken;
  out.devices = devices;
  return out;
}

/**
 * Indeks multi-user + store per user di dataDir.
 * dataDir null → hanya memori (tes).
 */
export class UserRegistry {
  constructor({ dataDir = null, bootstrapApiKey, log = console, now = () => Date.now() } = {}) {
    if (!bootstrapApiKey || String(bootstrapApiKey).length < 16) {
      throw new Error('bootstrapApiKey (API_KEY) wajib minimal 16 karakter');
    }
    this.dataDir = dataDir;
    this.bootstrapApiKey = String(bootstrapApiKey);
    this.log = log;
    this.now = now;
    this.indexPath = dataDir ? path.join(dataDir, 'users.json') : null;
    this.usersDir = dataDir ? path.join(dataDir, 'users') : null;
    this.legacyPath = dataDir ? path.join(dataDir, 'state.json') : null;
    /** @type {{ id: string, name: string, apiKeyHash: string, createdAt: string }[]} */
    this.index = [];
    /** @type {Map<string, Store>} */
    this.stores = new Map();
  }

  load() {
    if (this.usersDir) fs.mkdirSync(this.usersDir, { recursive: true });
    this.migrateLegacyIfNeeded();
    if (this.indexPath && fs.existsSync(this.indexPath)) {
      try {
        const raw = JSON.parse(fs.readFileSync(this.indexPath, 'utf8'));
        this.index = Array.isArray(raw?.users) ? raw.users : [];
      } catch {
        this.index = [];
      }
    }
    this.ensureBootstrapUser();
    for (const u of this.index) {
      this.openStore(u.id);
      this.normalizeUserStore(u.id);
    }
    return this;
  }

  openStore(userId) {
    if (this.stores.has(userId)) return this.stores.get(userId);
    const file = this.usersDir ? path.join(this.usersDir, `${userId}.json`) : null;
    const store = new Store(file);
    this.stores.set(userId, store);
    return store;
  }

  normalizeUserStore(userId) {
    const store = this.getStore(userId);
    const next = migrateUserDataShape({ ...store.data }, this.now());
    if (JSON.stringify(next) !== JSON.stringify(store.data)) {
      store.data = next;
      store.save();
    }
  }

  saveIndex() {
    if (!this.indexPath) return;
    fs.mkdirSync(path.dirname(this.indexPath), { recursive: true });
    const tmp = `${this.indexPath}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify({ users: this.index }, null, 2), { mode: 0o600 });
    fs.renameSync(tmp, this.indexPath);
  }

  migrateLegacyIfNeeded() {
    if (!this.legacyPath || !fs.existsSync(this.legacyPath)) return;
    if (this.indexPath && fs.existsSync(this.indexPath)) return;

    let legacy = {};
    try {
      legacy = JSON.parse(fs.readFileSync(this.legacyPath, 'utf8')) || {};
    } catch {
      legacy = {};
    }
    const id = 'default';
    const createdAt = new Date(this.now()).toISOString();
    this.index = [
      {
        id,
        name: 'Default',
        apiKeyHash: hashApiKey(this.bootstrapApiKey),
        createdAt,
      },
    ];
    this.saveIndex();
    const store = this.openStore(id);
    store.data = migrateUserDataShape(legacy, this.now());
    store.save();
    this.log.info?.('[users] migrasi state.json → users/default.json');
    try {
      fs.renameSync(this.legacyPath, `${this.legacyPath}.migrated`);
    } catch {
      // biarkan file lama jika rename gagal
    }
  }

  ensureBootstrapUser() {
    const hash = hashApiKey(this.bootstrapApiKey);
    if (this.index.some((u) => u.apiKeyHash === hash)) return;
    if (this.index.length >= MAX_USERS) {
      this.log.warn?.('[users] API_KEY bootstrap tidak ada di indeks dan slot penuh');
      return;
    }
    const id = this.index.length === 0 ? 'default' : generateUserId('bootstrap');
    this.index.push({
      id,
      name: this.index.length === 0 ? 'Default' : 'Bootstrap',
      apiKeyHash: hash,
      createdAt: new Date(this.now()).toISOString(),
    });
    this.saveIndex();
    this.openStore(id);
    this.normalizeUserStore(id);
    this.log.info?.(`[users] user bootstrap dibuat: ${id}`);
  }

  list() {
    return [...this.index];
  }

  getStore(userId) {
    return this.stores.get(userId) ?? null;
  }

  getMeta(userId) {
    return this.index.find((u) => u.id === userId) ?? null;
  }

  resolveApiKey(key) {
    if (!key) return null;
    const h = hashApiKey(key);
    return this.index.find((u) => u.apiKeyHash === h) ?? null;
  }

  addUser({ name }) {
    const trimmed = String(name ?? '').trim() || 'User';
    if (this.index.length >= MAX_USERS) {
      throw Object.assign(new Error(`Maksimal ${MAX_USERS} user (batas Spotify Development Mode)`), { status: 400 });
    }
    const apiKey = generateApiKey();
    const id = generateUserId(trimmed);
    const meta = {
      id,
      name: trimmed.slice(0, 64),
      apiKeyHash: hashApiKey(apiKey),
      createdAt: new Date(this.now()).toISOString(),
    };
    this.index.push(meta);
    this.saveIndex();
    this.openStore(id);
    this.normalizeUserStore(id);
    return { id: meta.id, name: meta.name, apiKey };
  }

  me(userId) {
    const meta = this.getMeta(userId);
    if (!meta) return null;
    const store = this.getStore(userId);
    const devices = Array.isArray(store?.get('devices')) ? store.get('devices') : [];
    return {
      userId: meta.id,
      name: meta.name,
      spotifyConnected: Boolean(store?.get('refreshToken')),
      deviceCount: devices.length,
    };
  }
}
