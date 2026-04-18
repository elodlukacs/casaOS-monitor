export interface CpuCore {
  name: string;
  usage: number;
}

export interface MemoryInfo {
  total: number;
  used: number;
  free: number;
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
}

export interface StorageInfo {
  mountpoint: string;
  label: string;
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
}

export interface LoadAvg {
  one: number;
  five: number;
  fifteen: number;
}

export interface Metrics {
  timestamp: number;
  hostname: string;
  uptime: string;
  cpuModel: string;
  loadAvg: LoadAvg;
  cpu: CpuCore[];
  memory: MemoryInfo;
  network: NetworkInterface[];
  disk: DiskInfo[];
  storage: StorageInfo[];
  temperature: TemperatureInfo | null;
  processes: Process[];
}
