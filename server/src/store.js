import fs from 'node:fs';
import path from 'node:path';

/**
 * Penyimpanan state kecil berbasis file JSON (refresh token Spotify, token push iPhone).
 * file = null → hanya di memori (untuk tes/simulasi).
 */
export class Store {
  constructor(file = null) {
    this.file = file;
    this.data = {};
    if (file && fs.existsSync(file)) {
      try {
        this.data = JSON.parse(fs.readFileSync(file, 'utf8')) || {};
      } catch {
        this.data = {};
      }
    }
  }

  get(key) {
    return this.data[key] ?? null;
  }

  set(patch) {
    this.data = { ...this.data, ...patch };
    this.save();
  }

  save() {
    if (!this.file) return;
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const tmp = `${this.file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(this.data, null, 2), { mode: 0o600 });
    fs.renameSync(tmp, this.file);
  }
}
