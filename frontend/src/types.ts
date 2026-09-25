export interface CpuCore {
  name: string;
  usage: number;
  iowait?: number; // % of time idle with disk I/O outstanding
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
  cpuLabel?: string; // which entry of `all` the cpu value comes from
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
  docker?: DockerContainer[] | null; // null: Docker API not configured or not reachable
  gpu?: GpuInfo | null;              // null: no readable GPU
  plex?: PlexInfo;                   // absent: Plex not configured
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
  iface?: string | null; // interface the rx/tx points belong to
  points: HistoryPoint[];
}

export type ServerMessage = Metrics | HistoryMessage;

// one graph sample: epoch ms + value
export interface Point {
  t: number;
  v: number;
}

export interface GpuInfo {
  card: string;
  driver: string;
  freqMhz: number | null;      // actual GT clock; 0 while asleep
  maxMhz: number | null;
  minMhz: number | null;
  busyPercent: number | null;  // amdgpu
  awakePercent: number | null; // i915: share of time out of RC6 sleep
  engines: Record<string, number> | null; // % busy per engine class, transcoders only
  transcoders: number;
  transcodersOnGpu: number;
  engineStats: boolean;        // kernel reports per-client engine time
}

export interface PlexSession {
  user: string;
  title: string;
  type: string;
  player: string;
  state: string; // playing | paused | buffering
  local: boolean | null;
  mode: 'direct play' | 'direct stream' | 'transcode';
  hw: boolean;
  resolution: string | null;
  bandwidthKbps: number | null;
  progress: number | null; // 0-1
}

export interface PlexInfo {
  sessions: PlexSession[];
  error: string | null;
}
