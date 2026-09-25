const fs = require('fs');

const SYS_PATH = process.env.SYS_PATH || '/sys';
const PROC_PATH = process.env.PROC_PATH || '/proc';
const CPU_DIR = `${SYS_PATH}/devices/system/cpu`;

// cpufreq attributes are in kHz (Documentation/admin-guide/pm/cpufreq.rst).
// cpuN/cpufreq is a symlink to that CPU's policy directory.
function readMhz(file) {
  try {
    const v = parseInt(fs.readFileSync(file, 'utf8').trim(), 10);
    return Number.isFinite(v) && v > 0 ? v / 1000 : null;
  } catch {
    return null;
  }
}

function readStr(file) {
  try {
    return fs.readFileSync(file, 'utf8').trim() || null;
  } catch {
    return null;
  }
}

// Per-boot facts, read once: which CPUs exist and the frequency range.
let statics = null;
function loadStatics() {
  let cpus = [];
  try {
    cpus = fs
      .readdirSync(CPU_DIR)
      .filter(d => /^cpu\d+$/.test(d))
      .map(d => parseInt(d.slice(3), 10))
      .sort((a, b) => a - b);
  } catch {}

  let min = null;
  let max = null;
  let base = null;
  for (const n of cpus) {
    const dir = `${CPU_DIR}/cpu${n}/cpufreq`;
    const mn = readMhz(`${dir}/cpuinfo_min_freq`);
    const mx = readMhz(`${dir}/cpuinfo_max_freq`);
    // intel_pstate with HWP only; running below it under load means throttling
    const bs = readMhz(`${dir}/base_frequency`);
    if (mn !== null) min = min === null ? mn : Math.min(min, mn);
    if (mx !== null) max = max === null ? mx : Math.max(max, mx);
    if (bs !== null) base = base === null ? bs : Math.min(base, bs);
  }
  const sysfs = cpus.some(n => fs.existsSync(`${CPU_DIR}/cpu${n}/cpufreq/scaling_cur_freq`));
  return { cpus, min, max, base, sysfs };
}

// Fallback for kernels/VMs without cpufreq: "cpu MHz" per processor block.
function fromCpuinfo() {
  const out = [];
  try {
    const txt = fs.readFileSync(`${PROC_PATH}/cpuinfo`, 'utf8');
    let cur = null;
    for (const line of txt.split('\n')) {
      let m = line.match(/^processor\s*:\s*(\d+)/);
      if (m) {
        cur = parseInt(m[1], 10);
        continue;
      }
      m = line.match(/^cpu MHz\s*:\s*([\d.]+)/);
      if (m && cur !== null) out[cur] = parseFloat(m[1]);
    }
  } catch {}
  return out;
}

function getCpuFreq() {
  if (!statics) statics = loadStatics();
  const { cpus, min, max, base, sysfs } = statics;

  let cores;
  if (sysfs) {
    cores = [];
    for (const n of cpus) cores[n] = readMhz(`${CPU_DIR}/cpu${n}/cpufreq/scaling_cur_freq`);
  } else {
    cores = fromCpuinfo();
  }

  const known = cores.filter(v => typeof v === 'number' && v > 0);
  if (known.length === 0) return null;

  const dense = [];
  for (let i = 0; i < cores.length; i++) dense[i] = typeof cores[i] === 'number' ? cores[i] : null;

  return {
    cores: dense, // MHz, index = logical cpu number (matches cpuN in /proc/stat)
    avg: known.reduce((a, b) => a + b, 0) / known.length,
    min,
    max,
    base,
    governor: sysfs ? readStr(`${CPU_DIR}/cpu${cpus[0]}/cpufreq/scaling_governor`) : null,
  };
}

module.exports = { getCpuFreq };
