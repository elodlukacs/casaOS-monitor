export interface CpuCore {
  name: string;
  usage: number;
}

export interface MemoryInfo {
  total: number;
  used: number;
  free: number;       // MemFree: truly unused
  available: number;  // MemAvailable: free + reclaimable cache
  buffers: number;
  cached: number;
  usedPercent: number;
  swap: {
    total: number;
    used: number;
    free: number;
    usedPercent: number;
  };
}

export interface NetworkInterface {
  iface: string;
  rxBytesPerSec: number;
  txBytesPerSec: number;
}

export interface DiskInfo {
  device: string;
  readBytesPerSec: number;
  writeBytesPerSec: number;
  busyPercent?: number; // share of time with I/O in flight
}

export interface StorageInfo {
  mountpoint: string;
  label: string;
  device?: string; // block device basename, e.g. sda2 / nvme0n1p2
  total: number;
  used: number;
  free: number;
  usedPercent: number;
}

export interface TemperatureInfo {
  cpu: number;
  all: { label: string; celsius: number }[];
}

export interface Process {
  pid: number;
  name: string;
  cpuPercent: number;
  memBytes: number;
  state: string;
  readBytesPerSec?: number;
  writeBytesPerSec?: number;
}

export interface DockerContainer {
  id: string;
  name: string;
  image: string;
  state: string;   // running | exited | paused | restarting | dead | created
  status: string;  // docker's human text, e.g. "Up 3 days (healthy)"
  cpuPercent: number;
  memUsage: number;
  memLimit: number;
  memPercent: number;
  rxBytesPerSec: number;
  txBytesPerSec: number;
}

export interface CpuFreq {
  cores: (number | null)[]; // MHz, index = logical cpu number (cpuN)
  avg: number;              // MHz, mean of cores with a reading
  min: number | null;       // MHz, hardware range
  max: number | null;
  base: number | null;      // MHz, Intel HWP only; below it under load = throttling
  governor: string | null;  // e.g. powersave, performance, schedutil
}

export interface Cooling {
  fans: { label: string; rpm: number }[];
  // software fan control channels the board exposes (pwmY); read-only here
  controls: { label: string; percent: number | null; mode: 'full' | 'manual' | 'auto' | null }[];
}

export interface LoadAvg {
  one: number;
  five: number;
  fifteen: number;
}

export interface Metrics {
  type?: 'metrics';
  timestamp: number;
  hostname: string;
  uptime: string;
  cpuModel: string;
  loadAvg: LoadAvg;
  cpu: CpuCore[];
  cpuFreq?: CpuFreq | null;
  memory: MemoryInfo;
  network: NetworkInterface[];
  disk: DiskInfo[];
  storage: StorageInfo[];
  temperature: TemperatureInfo | null;
  cooling?: Cooling | null;
  processes: Process[];
  docker?: DockerContainer[] | null; // null: docker socket not mounted
}

export interface HistoryPoint {
  t: number;
  cpu: number;
  temp: number | null;
  rx: number;
  tx: number;
}

export interface HistoryMessage {
  type: 'history';
  stepMs: number;
  points: HistoryPoint[];
}

export type ServerMessage = Metrics | HistoryMessage;

// one graph sample: epoch ms + value
export interface Point {
  t: number;
  v: number;
}
