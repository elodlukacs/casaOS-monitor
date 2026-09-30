const fs = require('fs');

const PROC_PATH = process.env.PROC_PATH || '/proc';
let prevNetStats = null;
let prevTime = null;

function readNetStats() {
  const content = fs.readFileSync(`${PROC_PATH}/net/dev`, 'utf8');
  const stats = {};
  content.split('\n').slice(2).forEach(line => {
    const trimmed = line.trim();
    if (!trimmed) return;
    const colonIdx = trimmed.indexOf(':');
    if (colonIdx === -1) return;
    const iface = trimmed.slice(0, colonIdx).trim();
    const parts = trimmed.slice(colonIdx + 1).trim().split(/\s+/).map(Number);
    stats[iface] = { rxBytes: parts[0], txBytes: parts[8] };
  });
  return stats;
}

// Interfaces carrying a default route in the main table, lowest metric first.
// /proc/net/route columns: Iface Destination Gateway Flags RefCnt Use Metric Mask ...
function defaultRouteIfaces() {
  try {
    return fs
      .readFileSync(`${PROC_PATH}/net/route`, 'utf8')
      .trim()
      .split('\n')
      .slice(1)
      .map(l => l.trim().split(/\s+/))
      .filter(p => p[1] === '00000000' && p[7] === '00000000' && (parseInt(p[3], 16) & 1)) // RTF_UP
      .sort((a, b) => Number(a[6]) - Number(b[6]))
      .map(p => p[0]);
  } catch {
    return [];
  }
}

// The main interface goes first; clients graph network[0]. /proc/net/dev
// lists interfaces in kernel order, which puts Wi-Fi or a VPN first on some
// boxes. Without a default route, fall back to the busiest since boot.
function primaryOrder(current) {
  const routed = defaultRouteIfaces();
  const rank = iface => {
    const i = routed.indexOf(iface);
    return i === -1 ? routed.length : i;
  };
  const traffic = iface => current[iface].rxBytes + current[iface].txBytes;
  return Object.keys(current)
    .filter(isPhysical)
    .sort((a, b) => rank(a) - rank(b) || (routed.length ? 0 : traffic(b) - traffic(a)));
}

function isPhysical(iface) {
  if (iface === 'lo') return false;
  if (iface.startsWith('veth')) return false;
  if (iface.startsWith('br-')) return false;
  if (iface === 'docker0') return false;
  return true;
}

function getNetworkInfo() {
  const current = readNetStats();
  const now = Date.now();

  if (!prevNetStats || !prevTime) {
    prevNetStats = current;
    prevTime = now;
    return primaryOrder(current).map(iface => ({
      iface, rxBytesPerSec: 0, txBytesPerSec: 0,
    }));
  }

  const elapsed = (now - prevTime) / 1000;
  const result = primaryOrder(current)
    .map(iface => {
      const prev = prevNetStats[iface];
      if (!prev) return { iface, rxBytesPerSec: 0, txBytesPerSec: 0 };
      return {
        iface,
        rxBytesPerSec: Math.max(0, (current[iface].rxBytes - prev.rxBytes) / elapsed),
        txBytesPerSec: Math.max(0, (current[iface].txBytes - prev.txBytes) / elapsed),
      };
    });

  prevNetStats = current;
  prevTime = now;
  return result;
}

module.exports = { getNetworkInfo };
