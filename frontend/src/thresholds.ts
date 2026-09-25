import type { Metrics } from './types';
import { theme } from './theme';

export type Level = 'ok' | 'warn' | 'crit';

interface Threshold {
  warn: number;
  crit: number;
}

// Where things turn yellow / red. Percentages unless noted.
export const THRESHOLDS = {
  cpuTemp: { warn: 70, crit: 80 },   // °C
  sensorTemp: { warn: 75, crit: 85 }, // °C, other sensors (nvme, chipset...)
  hddTemp: { warn: 50, crit: 55 },    // °C, SATA drives (drivetemp); spinning disks age fast above ~50
  diskUsage: { warn: 80, crit: 90 },
  memUsed: { warn: 85, crit: 95 },
  swapUsed: { warn: 50, crit: 80 },
  diskBusy: { warn: 80, crit: 95 },
} satisfies Record<string, Threshold>;

// Thresholds for one entry of temperature.all, by its "chip/label" name.
export function sensorThreshold(label: string): Threshold {
  return label.startsWith('drivetemp/') ? THRESHOLDS.hddTemp : THRESHOLDS.sensorTemp;
}

export function level(value: number, th: Threshold): Level {
  if (value >= th.crit) return 'crit';
  if (value >= th.warn) return 'warn';
  return 'ok';
}

// Colour for text at a level; undefined means "keep the normal colour".
export function levelColor(l: Level): string | undefined {
  if (l === 'crit') return theme.cpu_end;
  if (l === 'warn') return theme.cpu_mid;
  return undefined;
}

export function worst(levels: Level[]): Level {
  if (levels.includes('crit')) return 'crit';
  if (levels.includes('warn')) return 'warn';
  return 'ok';
}

export interface Alert {
  level: Level;
  text: string;
}

const MIN_MOUNT_SIZE = 1024 * 1024 * 1024;

export function collectAlerts(m: Metrics): Alert[] {
  const out: Alert[] = [];
  const add = (l: Level, text: string) => { if (l !== 'ok') out.push({ level: l, text }); };

  if (m.temperature) {
    add(level(m.temperature.cpu, THRESHOLDS.cpuTemp), `cpu ${m.temperature.cpu.toFixed(0)}°C`);
    for (const s of m.temperature.all) {
      const l = level(s.celsius, sensorThreshold(s.label));
      if (l === 'crit') add(l, `${s.label} ${s.celsius.toFixed(0)}°C`);
    }
  }

  add(level(m.memory.usedPercent, THRESHOLDS.memUsed), `memory ${m.memory.usedPercent.toFixed(0)}% used`);
  if (m.memory.swap.total > 0) {
    add(level(m.memory.swap.usedPercent, THRESHOLDS.swapUsed), `swap ${m.memory.swap.usedPercent.toFixed(0)}% used`);
  }

  for (const s of m.storage ?? []) {
    if (s.total < MIN_MOUNT_SIZE) continue;
    add(level(s.usedPercent, THRESHOLDS.diskUsage), `${s.label} ${s.usedPercent.toFixed(0)}% full`);
  }

  for (const c of m.docker ?? []) {
    if (c.state === 'restarting' || c.state === 'dead') add('crit', `${c.name} ${c.state}`);
    else if (c.state === 'running' && /unhealthy/i.test(c.status)) add('crit', `${c.name} unhealthy`);
  }

  out.sort((a, b) => (a.level === b.level ? 0 : a.level === 'crit' ? -1 : 1));
  return out;
}
