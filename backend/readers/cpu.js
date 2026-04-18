const fs = require('fs');

const PROC_PATH = process.env.PROC_PATH || '/proc';
let prevCpuStats = null;

function parseCpuLine(line) {
  const parts = line.trim().split(/\s+/);
  const name = parts[0];
  const [user, nice, system, idle, iowait, irq, softirq, steal] = parts.slice(1).map(Number);
  const total = user + nice + system + idle + iowait + irq + softirq + steal;
  const busy = total - idle - iowait;
  return { name, total, busy };
}

function readCpuStats() {
  const content = fs.readFileSync(`${PROC_PATH}/stat`, 'utf8');
  return content.split('\n').filter(l => l.startsWith('cpu')).map(parseCpuLine);
}

function getCpuUsage() {
  const current = readCpuStats();
  if (!prevCpuStats) {
    prevCpuStats = current;
    return current.map(c => ({ name: c.name, usage: 0 }));
  }
  const result = current.map((curr, i) => {
    const prev = prevCpuStats[i];
    if (!prev) return { name: curr.name, usage: 0 };
    const totalDelta = curr.total - prev.total;
    const busyDelta = curr.busy - prev.busy;
    const usage = totalDelta > 0 ? (busyDelta / totalDelta) * 100 : 0;
    return { name: curr.name, usage: Math.max(0, Math.min(100, usage)) };
  });
  prevCpuStats = current;
  return result;
}

module.exports = { getCpuUsage };
