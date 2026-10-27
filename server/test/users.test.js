import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { MAX_USERS, UserRegistry, hashApiKey, migrateUserDataShape } from '../src/users.js';
import { silentLog } from './helpers.js';

const BOOT = 'b'.repeat(24);

test('migrateUserDataShape: activity tunggal → devices[]', () => {
  const next = migrateUserDataShape({
    refreshToken: 'rt',
    prefs: { autoStart: true },
    activity: { token: 'aa'.repeat(32), id: 'A', registeredAtMs: 1 },
    deviceToken: 'bb'.repeat(32),
    pushToStartToken: 'cc'.repeat(32),
  });
  assert.equal(next.refreshToken, 'rt');
  assert.equal(next.activity, undefined);
  assert.equal(next.devices.length, 1);
  assert.equal(next.devices[0].activityToken, 'aa'.repeat(32));
  assert.equal(next.devices[0].deviceToken, 'bb'.repeat(32));
  assert.equal(next.devices[0].pushToStartToken, 'cc'.repeat(32));
});

test('UserRegistry migrasi state.json → users/default', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lirik-users-'));
  fs.writeFileSync(
    path.join(dir, 'state.json'),
    JSON.stringify({
      refreshToken: 'legacy-rt',
      activity: { token: 'dd'.repeat(32), id: 'L', registeredAtMs: 9 },
    }),
  );
  const reg = new UserRegistry({ dataDir: dir, bootstrapApiKey: BOOT, log: silentLog }).load();
  assert.equal(reg.list().length, 1);
  assert.equal(reg.list()[0].id, 'default');
  assert.equal(reg.list()[0].apiKeyHash, hashApiKey(BOOT));
  assert.equal(reg.getStore('default').get('refreshToken'), 'legacy-rt');
  assert.equal(reg.getStore('default').get('devices')[0].activityToken, 'dd'.repeat(32));
  assert.ok(fs.existsSync(path.join(dir, 'state.json.migrated')));
  assert.ok(reg.resolveApiKey(BOOT));
  assert.equal(reg.resolveApiKey('wrong'), null);
});

test('addUser menolak lebih dari MAX_USERS', () => {
  const reg = new UserRegistry({ bootstrapApiKey: BOOT, log: silentLog }).load();
  for (let i = reg.list().length; i < MAX_USERS; i++) {
    reg.addUser({ name: `U${i}` });
  }
  assert.throws(() => reg.addUser({ name: 'overflow' }), /Maksimal/);
});

test('me menampilkan deviceCount', () => {
  const reg = new UserRegistry({ bootstrapApiKey: BOOT, log: silentLog }).load();
  const store = reg.getStore('default');
  store.set({
    devices: [
      { deviceId: 'a', activityToken: null, activityId: null, deviceToken: null, pushToStartToken: null },
      { deviceId: 'b', activityToken: null, activityId: null, deviceToken: null, pushToStartToken: null },
    ],
  });
  const me = reg.me('default');
  assert.equal(me.deviceCount, 2);
  assert.equal(me.spotifyConnected, false);
});
