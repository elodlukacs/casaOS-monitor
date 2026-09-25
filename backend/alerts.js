// Server-side alerts: notify a phone when something stays wrong, whether or
// not anyone has the dashboard open.
//
// Channels, each on when its variables are set (any combination):
//   NTFY_URL             https://ntfy.sh/<secret-topic> or a self-hosted topic URL
//   NTFY_TOKEN           optional access token for a protected topic
//   DISCORD_WEBHOOK_URL  channel webhook URL
//   TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID
// Tuning:
//   ALERT_LEVEL          crit (default) or warn
//   ALERT_AFTER_SECONDS  how long a problem must last before notifying (60)
//   ALERT_REPEAT_HOURS   re-notify while it lasts, at most this often (6)
//
// Test from the host: docker exec casaos-monitor node backend/alerts.js --test

const os = require('os');

const env = process.env;
const LEVEL = env.ALERT_LEVEL === 'warn' ? 'warn' : 'crit';
const AFTER_MS = num(env.ALERT_AFTER_SECONDS, 60) * 1000;
const REPEAT_MS = num(env.ALERT_REPEAT_HOURS, 6) * 3600 * 1000;
const SEND_TIMEOUT_MS = 10000;

function num(v, fallback) {
  const n = Number(v);
  return v !== undefined && v !== '' && Number.isFinite(n) && n >= 0 ? n : fallback;
}

// Same numbers as frontend/src/thresholds.ts; keep the two in sync.
const THRESHOLDS = {
  cpuTemp: { warn: 70, crit: 80 },
  sensorTemp: { warn: 75, crit: 85 },
  hddTemp: { warn: 50, crit: 55 },
  diskUsage: { warn: 80, crit: 90 },
  memUsed: { warn: 85, crit: 95 },
};
const MIN_MOUNT_SIZE = 1024 * 1024 * 1024;

function level(value, th) {
  if (value >= th.crit) return 'crit';
  if (value >= th.warn) return 'warn';
  return 'ok';
}

// Current problems in a metrics frame: [{ key, level, text }]. `key` is stable
// for the same problem so it is tracked across samples.
function problems(m) {
  const out = [];
  // `what` names the thing for the "back to normal" message.
  const add = (key, l, text, what) => {
    if (l === 'crit' || (l === 'warn' && LEVEL === 'warn')) out.push({ key, level: l, text, what });
  };

  if (m.temperature) {
    add('temp:cpu', level(m.temperature.cpu, THRESHOLDS.cpuTemp), `CPU at ${m.temperature.cpu.toFixed(0)}°C`, 'CPU temperature');
    for (const s of m.temperature.all) {
      if (s.label === m.temperature.cpuLabel) continue; // already reported as "CPU"
      const th = s.label.startsWith('drivetemp/') ? THRESHOLDS.hddTemp : THRESHOLDS.sensorTemp;
      add(`temp:${s.label}`, level(s.celsius, th), `${s.label} at ${s.celsius.toFixed(0)}°C`, `${s.label} temperature`);
    }
  }
  if (m.memory && m.memory.total > 0) {
    add('mem', level(m.memory.usedPercent, THRESHOLDS.memUsed), `memory ${m.memory.usedPercent.toFixed(0)}% used`, 'memory use');
  }
  for (const s of m.storage || []) {
    if (s.total < MIN_MOUNT_SIZE) continue;
    add(`disk:${s.mountpoint}`, level(s.usedPercent, THRESHOLDS.diskUsage), `${s.mountpoint} is ${s.usedPercent.toFixed(0)}% full`, `${s.mountpoint} usage`);
  }
  for (const c of m.docker || []) {
    const what = `container ${c.name}`;
    if (c.state === 'restarting' || c.state === 'dead') add(`ctr:${c.name}`, 'crit', `${what} is ${c.state}`, what);
    else if (c.state === 'running' && /unhealthy/i.test(c.status)) add(`ctr:${c.name}`, 'crit', `${what} is unhealthy`, what);
  }
  return out;
}

// ---- channels ------------------------------------------------------------

function channels() {
  const list = [];
  if (env.NTFY_URL) {
    list.push({
      name: 'ntfy',
      send: ({ title, text, resolved }) =>
        post(env.NTFY_URL, text, {
          Title: asciiHeader(title),
          Priority: resolved ? 'default' : 'high',
          Tags: resolved ? 'white_check_mark' : 'warning',
          ...(env.NTFY_TOKEN ? { Authorization: `Bearer ${env.NTFY_TOKEN}` } : {}),
        }),
    });
  }
  if (env.DISCORD_WEBHOOK_URL) {
    list.push({
      name: 'discord',
      send: ({ title, text }) =>
        post(env.DISCORD_WEBHOOK_URL, JSON.stringify({ content: `**${title}**\n${text}` }), { 'Content-Type': 'application/json' }),
    });
  }
  if (env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_CHAT_ID) {
    list.push({
      name: 'telegram',
      send: ({ title, text }) =>
        post(
          `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`,
          JSON.stringify({ chat_id: env.TELEGRAM_CHAT_ID, text: `${title}\n${text}` }),
          { 'Content-Type': 'application/json' },
        ),
    });
  }
  return list;
}

// HTTP headers must be Latin-1; ntfy titles don't need the emoji or °.
function asciiHeader(s) {
  return s.replace(/°/g, ' ').replace(/[^\x20-\x7e]/g, '').trim();
}

async function post(url, body, headers) {
  const res = await fetch(url, { method: 'POST', body, headers, signal: AbortSignal.timeout(SEND_TIMEOUT_MS) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
}

// Resolves to one boolean per channel: whether it was delivered.
function notify(list, msg) {
  return Promise.all(
    list.map(c =>
      c.send(msg).then(
        () => true,
        e => {
          console.error(`alert via ${c.name} failed:`, e.message);
          return false;
        },
      ),
    ),
  );
}

// ---- state machine -------------------------------------------------------

// Each problem must last AFTER_MS before the first notification, repeats at
// most every REPEAT_MS while it lasts, and gets one "resolved" message once
// it has been gone for AFTER_MS (so a value hovering at the line doesn't
// flap).
function createAlerter({ hostname = os.hostname(), list = channels(), now = () => Date.now() } = {}) {
  const state = new Map(); // key -> { since, text, level, notifiedAt, clearSince }

  function check(metrics) {
    const t = now();
    const seen = new Set();
    for (const p of problems(metrics)) {
      seen.add(p.key);
      let s = state.get(p.key);
      if (!s) {
        s = { since: t, notifiedAt: null, clearSince: null };
        state.set(p.key, s);
      }
      s.text = p.text;
      s.what = p.what;
      s.level = p.level;
      s.clearSince = null;
      const due = s.notifiedAt === null ? t - s.since >= AFTER_MS : t - s.notifiedAt >= REPEAT_MS;
      if (due) {
        s.notifiedAt = t;
        notify(list, { title: `${hostname}: ${p.level === 'crit' ? 'problem' : 'warning'}`, text: p.text });
      }
    }
    for (const [key, s] of state) {
      if (seen.has(key)) continue;
      if (s.notifiedAt === null) {
        state.delete(key); // never reported, nothing to resolve
        continue;
      }
      if (s.clearSince === null) s.clearSince = t;
      if (t - s.clearSince >= AFTER_MS) {
        state.delete(key);
        notify(list, { title: `${hostname}: resolved`, text: `${s.what} back to normal (was: ${s.text})`, resolved: true });
      }
    }
  }

  return { check, enabled: list.length > 0, channels: list.map(c => c.name) };
}

module.exports = { createAlerter, problems };

if (require.main === module && process.argv.includes('--test')) {
  const list = channels();
  if (list.length === 0) {
    console.log('no alert channel configured (set NTFY_URL, DISCORD_WEBHOOK_URL or TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID)');
    process.exit(1);
  }
  let host = os.hostname();
  try {
    host = require('fs').readFileSync(`${env.PROC_PATH || '/proc'}/sys/kernel/hostname`, 'utf8').trim();
  } catch {}
  notify(list, { title: `${host}: test`, text: 'casaos-monitor alerts are working.' }).then(ok => {
    list.forEach((c, i) => console.log(`${c.name}: ${ok[i] ? 'sent' : 'FAILED'}`));
    process.exit(ok.every(Boolean) ? 0 : 1);
  });
}
