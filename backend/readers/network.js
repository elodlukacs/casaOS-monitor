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
    return Object.keys(current).filter(isPhysical).map(iface => ({
      iface, rxBytesPerSec: 0, txBytesPerSec: 0,
    }));
  }

  const elapsed = (now - prevTime) / 1000;
  const result = Object.keys(current)
    .filter(isPhysical)
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
