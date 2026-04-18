const fs = require('fs');

const PROC_PATH = process.env.PROC_PATH || '/proc';
const CLOCK_TICK = 100;

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
    // rest[0]=state, rest[11]=utime, rest[12]=stime (0-indexed after state/ppid/pgrp/session/tty/tpgid/flags/minflt/cminflt/majflt/cmajflt)
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

function getProcesses() {
  const now = Date.now();
  let pids;
  try {
    pids = fs.readdirSync(PROC_PATH).filter(f => /^\d+$/.test(f));
  } catch { return []; }

  const processes = [];
  const currentStats = {};

  for (const pid of pids) {
    const stat = readProcStat(pid);
    if (!stat) continue;
    const status = readProcStatus(pid);
    if (!status) continue;

    currentStats[pid] = stat.totalTime;

    let cpuPercent = 0;
    if (prevProcStats[pid] !== undefined && prevTime) {
      const elapsed = (now - prevTime) / 1000;
      const ticksDelta = stat.totalTime - prevProcStats[pid];
      cpuPercent = (ticksDelta / CLOCK_TICK / elapsed) * 100;
    }

    processes.push({
      pid: parseInt(pid),
      name: stat.name,
      cpuPercent: Math.max(0, cpuPercent),
      memBytes: status.vmRSS,
      state: status.state,
    });
  }

  prevProcStats = currentStats;
  prevTime = now;

  return processes.sort((a, b) => b.cpuPercent - a.cpuPercent).slice(0, 25);
}

module.exports = { getProcesses };
