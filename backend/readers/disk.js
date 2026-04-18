const fs = require('fs');

const PROC_PATH = process.env.PROC_PATH || '/proc';
let prevDiskStats = null;
let prevTime = null;

function readDiskStats() {
  const content = fs.readFileSync(`${PROC_PATH}/diskstats`, 'utf8');
  const stats = {};
  content.split('\n').forEach(line => {
    const parts = line.trim().split(/\s+/);
    if (parts.length < 14) return;
    const device = parts[2];
    if (device.startsWith('loop') || device.startsWith('ram')) return;
    // skip partitions like sda1, nvme0n1p1 — keep sda, nvme0n1, mmcblk0
    if (/sd[a-z]\d+$/.test(device)) return;
    if (/nvme\d+n\d+p\d+$/.test(device)) return;
    if (/mmcblk\d+p\d+$/.test(device)) return;
    stats[device] = {
      sectorsRead: parseInt(parts[5]),
      sectorsWritten: parseInt(parts[9]),
    };
  });
  return stats;
}

function getDiskInfo() {
  const current = readDiskStats();
  const now = Date.now();

  if (!prevDiskStats || !prevTime) {
    prevDiskStats = current;
    prevTime = now;
    return Object.keys(current).map(device => ({ device, readBytesPerSec: 0, writeBytesPerSec: 0 }));
  }

  const elapsed = (now - prevTime) / 1000;
  const SECTOR = 512;

  const result = Object.keys(current).map(device => {
    const prev = prevDiskStats[device];
    if (!prev) return { device, readBytesPerSec: 0, writeBytesPerSec: 0 };
    return {
      device,
      readBytesPerSec: Math.max(0, ((current[device].sectorsRead - prev.sectorsRead) * SECTOR) / elapsed),
      writeBytesPerSec: Math.max(0, ((current[device].sectorsWritten - prev.sectorsWritten) * SECTOR) / elapsed),
    };
  });

  prevDiskStats = current;
  prevTime = now;
  return result;
}

module.exports = { getDiskInfo };
