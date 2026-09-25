const fs = require('fs');
const path = require('path');

const SYS_PATH = process.env.SYS_PATH || '/sys';

// hwmon ABI (Documentation/ABI/testing/sysfs-class-hwmon):
//   fanY_input   RPM, read-only
//   pwmY         0-255 duty cycle, 255 = 100%
//   pwmY_enable  0 = no control (full speed), 1 = manual, 2+ = automatic
// This reader only reads. It reports fan speeds and whether the board
// exposes software fan control at all; it never changes anything.
// fanY and pwmY share a number by convention only, so they are reported
// as separate lists rather than paired.

function readInt(file) {
  try {
    const v = parseInt(fs.readFileSync(file, 'utf8').trim(), 10);
    return Number.isFinite(v) ? v : null;
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

function modeOf(enable) {
  if (enable === null) return null;
  if (enable === 0) return 'full';
  if (enable === 1) return 'manual';
  return 'auto';
}

function getCooling() {
  const base = `${SYS_PATH}/class/hwmon`;
  let hwmons;
  try {
    hwmons = fs.readdirSync(base);
  } catch {
    return { fans: [], controls: [] };
  }

  const fans = [];
  const controls = [];
  for (const h of hwmons) {
    const dir = path.join(base, h);
    const chip = readStr(path.join(dir, 'name')) || h;
    let files;
    try {
      files = fs.readdirSync(dir);
    } catch {
      continue;
    }

    for (const f of files) {
      let m = f.match(/^fan(\d+)_input$/);
      if (m) {
        const rpm = readInt(path.join(dir, f));
        if (rpm === null || rpm < 0) continue;
        const label = readStr(path.join(dir, `fan${m[1]}_label`)) || `fan${m[1]}`;
        fans.push({ key: [h, +m[1]], label: `${chip}/${label}`, rpm });
        continue;
      }
      m = f.match(/^pwm(\d+)$/);
      if (m) {
        const raw = readInt(path.join(dir, f));
        controls.push({
          key: [h, +m[1]],
          label: `${chip}/pwm${m[1]}`,
          percent: raw === null ? null : Math.round((raw / 255) * 100),
          mode: modeOf(readInt(path.join(dir, `pwm${m[1]}_enable`))),
        });
      }
    }
  }

  // Order by chip, then channel number (the order `sensors` prints), not by
  // label: a custom label like "CPU Fan" on fan10 must not jump ahead of fan1.
  const byChannel = (a, b) =>
    a.key[0].localeCompare(b.key[0], undefined, { numeric: true }) || a.key[1] - b.key[1];
  const strip = ({ key, ...rest }) => rest;
  return { fans: fans.sort(byChannel).map(strip), controls: controls.sort(byChannel).map(strip) };
}

module.exports = { getCooling };
