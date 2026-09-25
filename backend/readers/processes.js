const fs = require('fs');

const PROC_PATH = process.env.PROC_PATH || '/proc';
const CLOCK_TICK = 100;
// RSS in /proc/[pid]/stat is in pages; 4 KiB on x86 and almost all arm64 kernels.
const PAGE_SIZE = Number(process.env.PAGE_SIZE) || 4096;
// Kept per sort key (cpu, memory, disk I/O), so sorting the list by memory in
// the UI shows the real top memory users, not the busiest-CPU ones reordered.
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
    // rest[n] is field n+3 of proc(5): rest[0]=state, rest[11]=utime,
    // rest[12]=stime, rest[21]=rss (pages). Everything the list needs, so
    // /proc/[pid]/status doesn't have to be read as well.
    const utime = parseInt(rest[11]);
    const stime = parseInt(rest[12]);
    const rss = parseInt(rest[21]);
    return {
      name,
      state: rest[0] || '?',
      totalTime: utime + stime,
      rssBytes: Number.isFinite(rss) ? rss * PAGE_SIZE : 0,
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
      memBytes: stat.rssBytes,
      state: stat.state,
      readBytesPerSec: Math.max(0, readBytesPerSec),
      writeBytesPerSec: Math.max(0, writeBytesPerSec),
    });
  }

  prevProcStats = currentStats;
  prevTime = now;

  const ioRate = p => p.readBytesPerSec + p.writeBytesPerSec;
  const keep = new Set(topBy(processes, p => p.cpuPercent));
  for (const p of topBy(processes, p => p.memBytes)) keep.add(p);
  for (const p of topBy(processes.filter(p => ioRate(p) > 0), ioRate)) keep.add(p);
  // Still ordered by CPU, so clients that read the first rows see the same thing as before.
  return [...keep].sort((a, b) => b.cpuPercent - a.cpuPercent);
}

function topBy(list, key) {
  return [...list].sort((a, b) => key(b) - key(a)).slice(0, TOP_N);
}

module.exports = { getProcesses };
