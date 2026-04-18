const fs = require('fs');
const path = require('path');

const SYS_PATH = process.env.SYS_PATH || '/sys';

// preferred zone type keywords, in priority order
const CPU_KEYWORDS = ['pkg', 'cpu', 'core', 'x86', 'soc', 'acpi'];

function readMilliC(filePath) {
  try {
    return parseInt(fs.readFileSync(filePath, 'utf8').trim());
  } catch { return null; }
}

function readStr(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8').trim();
  } catch { return null; }
}

function getThermalZones() {
  const base = `${SYS_PATH}/class/thermal`;
  let zones;
  try {
    zones = fs.readdirSync(base).filter(d => d.startsWith('thermal_zone'));
  } catch { return []; }

  return zones.map(zone => {
    const dir = path.join(base, zone);
    const milliC = readMilliC(path.join(dir, 'temp'));
    const type = readStr(path.join(dir, 'type')) || zone;
    if (milliC === null) return null;
    return { label: type, celsius: milliC / 1000 };
  }).filter(Boolean);
}

function getHwmonTemps() {
  const base = `${SYS_PATH}/class/hwmon`;
  let hwmons;
  try {
    hwmons = fs.readdirSync(base);
  } catch { return []; }

  const results = [];
  for (const hwmon of hwmons) {
    const dir = path.join(base, hwmon);
    const name = readStr(path.join(dir, 'name')) || hwmon;
    // find all temp*_input files
    let files;
    try { files = fs.readdirSync(dir); } catch { continue; }
    for (const file of files) {
      if (!/^temp\d+_input$/.test(file)) continue;
      const milliC = readMilliC(path.join(dir, file));
      if (milliC === null || milliC <= 0) continue;
      const idx = file.match(/\d+/)[0];
      const label = readStr(path.join(dir, `temp${idx}_label`)) || name;
      results.push({ label: `${name}/${label}`, celsius: milliC / 1000 });
    }
  }
  return results;
}

function getTemperatures() {
  const all = [...getThermalZones(), ...getHwmonTemps()];
  if (all.length === 0) return null;

  // pick best CPU temp by keyword priority
  for (const kw of CPU_KEYWORDS) {
    const match = all.find(t => t.label.toLowerCase().includes(kw));
    if (match) return { cpu: match.celsius, all };
  }

  // fallback: highest reading
  const hottest = all.reduce((a, b) => a.celsius > b.celsius ? a : b);
  return { cpu: hottest.celsius, all };
}

module.exports = { getTemperatures };
