const crypto = require('crypto');

// Who may open the metrics WebSocket.
//
// Origin: a browser always sends the page's origin on a WebSocket handshake,
// and any web page can try to open ws://<nas>:3030. Without a check, a page
// on the internet opened by someone on the LAN could read the process and
// container lists. Accepted:
//   - no Origin header: not a browser (curl, scripts)
//   - the same host the request was sent to: the dashboard served by us
//   - localhost: the Android app's WebView (https://localhost) and `vite dev`
//   - anything listed in ALLOWED_ORIGINS (comma separated), for reverse proxies
//     that change the host name, e.g. https://monitor.example.com
//
// MONITOR_TOKEN: optional shared secret, off unless set. When set, the client
// must connect with ?token=<value>. The mobile app has no way to send one, so
// it cannot connect while this is on.

const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map(s => s.trim().replace(/\/+$/, ''))
  .filter(Boolean);
const TOKEN = process.env.MONITOR_TOKEN || '';
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

function originAllowed(origin, host, allowed = ALLOWED_ORIGINS) {
  if (!origin) return true;
  let u;
  try {
    u = new URL(origin);
  } catch {
    return false;
  }
  if (host && u.host === host) return true;
  if (LOCAL_HOSTS.has(u.hostname)) return true;
  return allowed.includes(u.origin);
}

function tokenOk(url, token = TOKEN) {
  if (!token) return true;
  let given;
  try {
    given = new URL(url || '/', 'http://x').searchParams.get('token') || '';
  } catch {
    return false;
  }
  const a = crypto.createHash('sha256').update(given).digest();
  const b = crypto.createHash('sha256').update(token).digest();
  return crypto.timingSafeEqual(a, b);
}

// ws `verifyClient` hook (async form, so a status code can be returned).
function verifyClient(info, done) {
  const { origin, host } = info.req.headers;
  if (!originAllowed(origin, host)) {
    console.log(`rejected websocket from origin ${origin} (add it to ALLOWED_ORIGINS if it is yours)`);
    return done(false, 403, 'origin not allowed');
  }
  if (!tokenOk(info.req.url)) return done(false, 401, 'token required');
  done(true);
}

module.exports = { verifyClient, originAllowed, tokenOk, tokenRequired: !!TOKEN };
