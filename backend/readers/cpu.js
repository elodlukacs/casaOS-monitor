const fs = require('fs');

const PROC_PATH = process.env.PROC_PATH || '/proc';
let prevCpuStats = null;

function parseCpuLine(line) {
  const parts = line.trim().split(/\s+/);
  const name = parts[0];
  const [user, nice, system, idle, iowait, irq, softirq, steal] = parts.slice(1).map(Number);
  const total = user + nice + system + idle + iowait + irq + softirq + steal;
  const busy = total - idle - iowait;
  return { name, total, busy, iowait };
}

function readCpuStats() {
  const content = fs.readFileSync(`${PROC_PATH}/stat`, 'utf8');
  return content.split('\n').filter(l => l.startsWith('cpu')).map(parseCpuLine);
}

function getCpuUsage() {
  const current = readCpuStats();
  if (!prevCpuStats) {
    prevCpuStats = current;
    return current.map(c => ({ name: c.name, usage: 0, iowait: 0 }));
  }
  const result = current.map((curr, i) => {
    const prev = prevCpuStats[i];
    if (!prev) return { name: curr.name, usage: 0, iowait: 0 };
    const totalDelta = curr.total - prev.total;
    const busyDelta = curr.busy - prev.busy;
    const usage = totalDelta > 0 ? (busyDelta / totalDelta) * 100 : 0;
    // Idle time spent with disk I/O outstanding. Not counted as usage, but a
    // high value on a NAS means the disks, not the CPU, are the bottleneck.
    const iowait = totalDelta > 0 ? ((curr.iowait - prev.iowait) / totalDelta) * 100 : 0;
    const clamp = v => Math.max(0, Math.min(100, v));
    return { name: curr.name, usage: clamp(usage), iowait: clamp(iowait) };
  });
  prevCpuStats = current;
  return result;
}

module.exports = { getCpuUsage };
