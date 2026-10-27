import crypto from 'node:crypto';
import http2 from 'node:http2';

const HOSTS = {
  development: 'https://api.sandbox.push.apple.com',
  production: 'https://api.push.apple.com',
};

/** JWT ES256 untuk autentikasi APNs berbasis token (.p8). */
export function signJwt({ teamId, keyId, privateKey, iat }) {
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const data = `${b64({ alg: 'ES256', kid: keyId })}.${b64({ iss: teamId, iat })}`;
  const sig = crypto.sign('sha256', Buffer.from(data), { key: privateKey, dsaEncoding: 'ieee-p1363' });
  return `${data}.${sig.toString('base64url')}`;
}

/** Token tidak berlaku lagi (activity sudah selesai / app dihapus) → server berhenti memakainya. */
export function isDeadToken(result) {
  return result.status === 410 || (result.status === 400 && result.reason === 'BadDeviceToken');
}

const short = (t) => `${String(t).slice(0, 8)}…`;

export function createApns({
  teamId,
  keyId,
  privateKey,
  bundleId,
  env = 'development',
  dryRun = false,
  log = console,
  now = () => Date.now(),
}) {
  const liveActivityTopic = `${bundleId}.push-type.liveactivity`;
  let jwt = null;
  let jwtAt = 0;
  let session = null;

  function authToken() {
    // Apple: pakai ulang token, perbarui tiap 20–60 menit
    if (!jwt || now() - jwtAt > 50 * 60_000) {
      jwtAt = now();
      jwt = signJwt({ teamId, keyId, privateKey, iat: Math.floor(jwtAt / 1000) });
    }
    return jwt;
  }

  function getSession() {
    if (session && !session.closed && !session.destroyed) return session;
    const s = http2.connect(HOSTS[env]);
    s.on('error', (e) => {
      log.warn?.(`[apns] koneksi error: ${e.message}`);
      s.destroy();
      if (session === s) session = null;
    });
    s.on('goaway', () => {
      s.close();
      if (session === s) session = null;
    });
    s.unref();
    session = s;
    return s;
  }

  /**
   * @param {string} deviceToken
   * @param {object} aps — objek `aps` APNs
   * @param {{ priority?: number, label?: string, pushType?: string, topic?: string, extra?: object }} [opts]
   *   - Live Activity (default): pushType liveactivity, topic bundleId.push-type.liveactivity
   *   - Background: pushType background, topic = bundleId, priority 5, extra di root payload
   */
  async function send(deviceToken, aps, { priority = 10, label = 'push', pushType = 'liveactivity', topic: topicOverride, extra = {} } = {}) {
    const payload = JSON.stringify({ aps, ...extra });
    const apnsTopic =
      topicOverride ?? (pushType === 'background' ? bundleId : liveActivityTopic);
    if (dryRun) {
      log.info?.(`[apns:dry-run] ${label} type=${pushType} topic=${apnsTopic} → ${short(deviceToken)} ${payload}`);
      return { ok: true, status: 200, dryRun: true };
    }
    return new Promise((resolve) => {
      let done = false;
      const finish = (r) => {
        if (!done) {
          done = true;
          resolve(r);
        }
      };
      let req;
      try {
        req = getSession().request({
          ':method': 'POST',
          ':path': `/3/device/${deviceToken}`,
          authorization: `bearer ${authToken()}`,
          'apns-topic': apnsTopic,
          'apns-push-type': pushType,
          'apns-priority': String(priority),
          'content-type': 'application/json',
        });
      } catch (e) {
        session = null;
        return finish({ ok: false, status: 0, reason: e.message });
      }
      let status = 0;
      let body = '';
      req.setEncoding('utf8');
      req.setTimeout(10_000, () => {
        req.close(http2.constants.NGHTTP2_CANCEL);
        finish({ ok: false, status: 0, reason: 'timeout' });
      });
      req.on('response', (h) => {
        status = Number(h[':status']);
      });
      req.on('data', (c) => {
        body += c;
      });
      req.on('end', () => {
        let reason;
        try {
          reason = body ? JSON.parse(body).reason : undefined;
        } catch {
          reason = body.slice(0, 100);
        }
        finish({ ok: status === 200, status, reason });
      });
      req.on('error', (e) => finish({ ok: false, status: 0, reason: e.message }));
      req.end(payload);
    });
  }

  return {
    topic: liveActivityTopic,
    bundleId,
    send,
    close() {
      session?.close();
      session = null;
    },
  };
}
