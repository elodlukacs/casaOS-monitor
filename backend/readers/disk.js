const fs = require('fs');

const PROC_PATH = process.env.PROC_PATH || '/proc';
const SECTOR = 512;
let prevDiskStats = null;
let prevTime = null;

// /proc/diskstats fields (after major, minor, name):
//   [3] reads completed  [5] sectors read  [7] writes completed
//   [9] sectors written  [12] ms spent doing I/O (io_ticks)
function readDiskStats() {
  const content = fs.readFileSync(`${PROC_PATH}/diskstats`, 'utf8');
  const stats = {};
  content.split('\n').forEach(line => {
    const parts = line.trim().split(/\s+/);
    if (parts.length < 14) return;
    const device = parts[2];
    if (device.startsWith('loop') || device.startsWith('ram') || device.startsWith('zram')) return;
    // skip partitions like sda1, nvme0n1p1 — keep sda, nvme0n1, mmcblk0
    if (/sd[a-z]+\d+$/.test(device)) return;
    if (/nvme\d+n\d+p\d+$/.test(device)) return;
    if (/mmcblk\d+p\d+$/.test(device)) return;
    stats[device] = {
      sectorsRead: parseInt(parts[5]),
      sectorsWritten: parseInt(parts[9]),
      ioMs: parseInt(parts[12]),
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
    return Object.keys(current).map(device => ({ device, readBytesPerSec: 0, writeBytesPerSec: 0, busyPercent: 0 }));
  }

  const elapsedMs = now - prevTime;
  const elapsed = elapsedMs / 1000;

  const result = Object.keys(current).map(device => {
    const prev = prevDiskStats[device];
    const cur = current[device];
    if (!prev || elapsedMs <= 0) return { device, readBytesPerSec: 0, writeBytesPerSec: 0, busyPercent: 0 };
    return {
      device,
      readBytesPerSec: Math.max(0, ((cur.sectorsRead - prev.sectorsRead) * SECTOR) / elapsed),
      writeBytesPerSec: Math.max(0, ((cur.sectorsWritten - prev.sectorsWritten) * SECTOR) / elapsed),
      // share of wall time the device had at least one request in flight
      busyPercent: Math.min(100, Math.max(0, ((cur.ioMs - prev.ioMs) / elapsedMs) * 100)),
    };
  });

  prevDiskStats = current;
  prevTime = now;
  return result;
}

module.exports = { getDiskInfo };
