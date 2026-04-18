const fs = require('fs');

const PROC_PATH = process.env.PROC_PATH || '/proc';

function getMemoryInfo() {
  const content = fs.readFileSync(`${PROC_PATH}/meminfo`, 'utf8');
  const map = {};
  content.split('\n').forEach(line => {
    const [key, val] = line.split(':');
    if (key && val) map[key.trim()] = parseInt(val.trim()) * 1024;
  });

  const total = map['MemTotal'] || 0;
  const available = map['MemAvailable'] || 0;
  const buffers = map['Buffers'] || 0;
  const cached = map['Cached'] || 0;
  const swapTotal = map['SwapTotal'] || 0;
  const swapFree = map['SwapFree'] || 0;
  const used = total - available;

  return {
    total,
    used,
    free: available,
    buffers,
    cached,
    usedPercent: total > 0 ? (used / total) * 100 : 0,
    swap: {
      total: swapTotal,
      used: swapTotal - swapFree,
      free: swapFree,
      usedPercent: swapTotal > 0 ? ((swapTotal - swapFree) / swapTotal) * 100 : 0,
    },
  };
}

module.exports = { getMemoryInfo };
