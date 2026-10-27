// Menjaga server dan app iOS tetap memakai kontrak data yang sama.
// Kalau tes ini gagal setelah mengubah payload: ikuti checklist di docs/API.md §3.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { LyricsEngine } from '../src/engine.js';
import { Store } from '../src/store.js';
import { engineConfig, fakeApns, FakeClock, fakeSpotify, silentLog } from './helpers.js';

const root = new URL('../../', import.meta.url);
const read = (p) => fs.readFileSync(fileURLToPath(new URL(p, root)), 'utf8');

const contract = JSON.parse(read('contract/live-activity.json'));
const attributesSwift = read('ios/Shared/LyricsActivityAttributes.swift');
const clientSwift = read('ios/LirikIsland/ServerClient.swift');

const SWIFT_TYPES = { String: 'string', Bool: 'boolean', Int: 'number', Double: 'number' };

/** Ambil isi `struct Nama ... { ... }` dengan pencocokan kurung kurawal. */
function structBody(src, name) {
  const m = new RegExp(`struct\\s+${name}\\b[^{]*\\{`).exec(src);
  assert.ok(m, `struct ${name} tidak ditemukan`);
  let depth = 1;
  let i = m.index + m[0].length;
  const start = i;
  for (; i < src.length && depth > 0; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') depth--;
  }
  return src.slice(start, i - 1);
}

/** Hapus struct/enum/func bersarang supaya hanya properti level atas yang tersisa. */
function topLevel(body) {
  let out = '';
  let depth = 0;
  for (const ch of body) {
    if (ch === '{') depth++;
    if (depth === 0) out += ch;
    if (ch === '}') depth--;
  }
  return out;
}

/** { nama: { type, optional } } dari deklarasi `var`/`let` level atas. */
function properties(body) {
  const props = {};
  for (const m of topLevel(body).matchAll(/(?:var|let)\s+(\w+)\s*:\s*([\w.]+)(\?)?/g)) {
    props[m[1]] = { type: m[2], optional: Boolean(m[3]) };
  }
  return props;
}

function makeEngine(lyrics) {
  const clock = new FakeClock();
  const store = new Store(null);
  store.set({ activity: { token: 'ab'.repeat(32), id: 'A', registeredAtMs: clock.now() } });
  const track = { id: 't', title: 'Judul', artist: 'Artis', primaryArtist: 'Artis', album: '', durationMs: 60_000 };
  const apns = fakeApns();
  const engine = new LyricsEngine({
    spotify: fakeSpotify(clock, { track }),
    lyrics: { getLyrics: async () => lyrics },
    apns,
    store,
    config: engineConfig(),
    clock: { now: clock.now },
    timers: clock.timers,
    log: silentLog,
  });
  return { clock, engine, apns };
}

test('Swift: nama struct = attributes-type', () => {
  assert.match(attributesSwift, new RegExp(`struct\\s+${contract.attributesType}\\s*:\\s*ActivityAttributes`));
});

test('Swift: ContentState sama dengan kontrak', () => {
  const props = properties(structBody(attributesSwift, 'ContentState'));
  const swift = Object.fromEntries(Object.entries(props).map(([k, v]) => [k, SWIFT_TYPES[v.type] ?? v.type]));
  assert.deepEqual(swift, contract.contentState);
});

test('Swift: attributes statis sama dengan kontrak', () => {
  const body = structBody(attributesSwift, contract.attributesType);
  const props = properties(body);
  const swift = Object.fromEntries(Object.entries(props).map(([k, v]) => [k, SWIFT_TYPES[v.type] ?? v.type]));
  assert.deepEqual(swift, contract.attributes);
});

test('Swift: decoder toleran menangani semua key kontrak', () => {
  for (const key of Object.keys(contract.contentState)) {
    assert.match(attributesSwift, new RegExp(`forKey:\\s*\\.${key}\\)`), `decodeIfPresent untuk "${key}" tidak ada`);
  }
});

test('Server: content-state di setiap kondisi persis sesuai kontrak', async () => {
  const cases = [
    { status: 'synced', lines: [{ t: 0, text: 'a' }, { t: 5000, text: 'b' }] },
    { status: 'none', lines: [] },
    { status: 'instrumental', lines: [] },
    { status: 'plain', lines: [] },
    { status: 'error', lines: [] },
  ];
  for (const lyrics of cases) {
    const { clock, engine, apns } = makeEngine(lyrics);
    engine.start();
    await clock.advance(6000);
    engine.stop();
    assert.ok(apns.sent.length > 0);
    for (const { aps } of apns.sent) {
      const state = aps['content-state'];
      assert.deepEqual(Object.keys(state).sort(), Object.keys(contract.contentState).sort(), `key (${lyrics.status})`);
      for (const [k, type] of Object.entries(contract.contentState)) assert.equal(typeof state[k], type, `${k} (${lyrics.status})`);
      for (const k of ['title', 'artist', 'line', 'nextLine']) assert.ok(state[k].length <= contract.limits.maxTextLength);
      assert.ok(Buffer.byteLength(JSON.stringify({ aps })) < contract.limits.maxPayloadBytes);
    }
  }
});

test('Server: event start memakai attributes-type & attributes kontrak', async () => {
  const clock = new FakeClock();
  const store = new Store(null);
  store.set({ pushToStartToken: 'cd'.repeat(32) });
  const apns = fakeApns();
  const engine = new LyricsEngine({
    spotify: fakeSpotify(clock, { track: { id: 't', title: 'J', artist: 'A', primaryArtist: 'A', album: '', durationMs: 60_000 } }),
    lyrics: { getLyrics: async () => ({ status: 'none', lines: [] }) },
    apns,
    store,
    config: engineConfig(),
    clock: { now: clock.now },
    timers: clock.timers,
    log: silentLog,
  });
  engine.start();
  await clock.advance(100);
  engine.stop();
  const start = apns.sent.find((s) => s.aps.event === 'start');
  assert.ok(start);
  assert.equal(start.aps['attributes-type'], contract.attributesType);
  assert.deepEqual(
    Object.fromEntries(Object.entries(start.aps.attributes).map(([k, v]) => [k, typeof v])),
    contract.attributes,
  );
});

test('Server: /api/status memenuhi field wajib ServerStatus di Swift', async () => {
  const { clock, engine } = makeEngine({ status: 'synced', lines: [{ t: 0, text: 'a' }] });
  engine.start();
  await clock.advance(2000);
  await engine.testPush(); // supaya lastPush terisi
  engine.stop();
  const status = JSON.parse(JSON.stringify(engine.status()));

  const check = (obj, swiftBody, label) => {
    for (const [name, { type, optional }] of Object.entries(properties(swiftBody))) {
      if (!optional) {
        assert.ok(name in obj && obj[name] !== null, `${label}.${name} wajib ada (non-opsional di Swift)`);
      }
      if (name in obj && obj[name] !== null && SWIFT_TYPES[type]) {
        assert.equal(typeof obj[name], SWIFT_TYPES[type], `${label}.${name} bertipe ${type}`);
      }
    }
  };
  const serverStatus = structBody(clientSwift, 'ServerStatus');
  check(status, serverStatus, 'status');
  check(status.nowPlaying, structBody(serverStatus, 'NowPlaying'), 'status.nowPlaying');
  check(status.lastPush, structBody(serverStatus, 'LastPush'), 'status.lastPush');
});
