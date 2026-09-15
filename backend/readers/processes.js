const fs = require('fs');

const PROC_PATH = process.env.PROC_PATH || '/proc';
const CLOCK_TICK = 100;
const TOP_N = 40;

let prevProcStats = {};
let prevTime = null;

function readProcStat(pid) {
  try {
    const content = fs.readFileSync(`${PROC_PATH}/${pid}/stat`, 'utf8');
    // comm can contain spaces and parens — match last ')' as end of comm field
    const lastParen = content.lastIndexOf(')');
    if (lastParen === -1) return null;
    const name = content.slice(content.indexOf('(') + 1, lastParen);
    const rest = content.slice(lastParen + 2).trim().split(/\s+/);
    // rest[0]=state ... rest[11]=utime, rest[12]=stime
    const utime = parseInt(rest[11]);
    const stime = parseInt(rest[12]);
    return { name, totalTime: utime + stime };
  } catch { return null; }
}

function readProcStatus(pid) {
  try {
    const content = fs.readFileSync(`${PROC_PATH}/${pid}/status`, 'utf8');
    const vmRSS = content.match(/VmRSS:\s+(\d+)/);
    const state = content.match(/State:\s+(\S)/);
    return {
      vmRSS: vmRSS ? parseInt(vmRSS[1]) * 1024 : 0,
      state: state ? state[1] : '?',
    };
  } catch { return null; }
}

// read_bytes / write_bytes are actual storage I/O (not page cache hits).
// Needs root for other users' processes, which the container has.
function readProcIo(pid) {
  try {
    const content = fs.readFileSync(`${PROC_PATH}/${pid}/io`, 'utf8');
    const r = content.match(/^read_bytes:\s+(\d+)/m);
    const w = content.match(/^write_bytes:\s+(\d+)/m);
    return { read: r ? parseInt(r[1]) : 0, write: w ? parseInt(w[1]) : 0 };
  } catch { return null; }
}

function getProcesses() {
  const now = Date.now();
  let pids;
  try {
    pids = fs.readdirSync(PROC_PATH).filter(f => /^\d+$/.test(f));
  } catch { return []; }

  const processes = [];
  const currentStats = {};
  const elapsed = prevTime ? (now - prevTime) / 1000 : 0;

  for (const pid of pids) {
    const stat = readProcStat(pid);
    if (!stat) continue;
    const status = readProcStatus(pid);
    if (!status) continue;
    const io = readProcIo(pid);

    currentStats[pid] = { totalTime: stat.totalTime, read: io ? io.read : 0, write: io ? io.write : 0 };

    let cpuPercent = 0;
    let readBytesPerSec = 0;
    let writeBytesPerSec = 0;
    const prev = prevProcStats[pid];
    if (prev && elapsed > 0) {
      cpuPercent = ((stat.totalTime - prev.totalTime) / CLOCK_TICK / elapsed) * 100;
      if (io) {
        readBytesPerSec = (io.read - prev.read) / elapsed;
        writeBytesPerSec = (io.write - prev.write) / elapsed;
      }
    }

    processes.push({
      pid: parseInt(pid),
      name: stat.name,
      cpuPercent: Math.max(0, cpuPercent),
      memBytes: status.vmRSS,
      state: status.state,
      readBytesPerSec: Math.max(0, readBytesPerSec),
      writeBytesPerSec: Math.max(0, writeBytesPerSec),
    });
  }

  prevProcStats = currentStats;
  prevTime = now;

  return processes.sort((a, b) => b.cpuPercent - a.cpuPercent).slice(0, TOP_N);
}

module.exports = { getProcesses };
