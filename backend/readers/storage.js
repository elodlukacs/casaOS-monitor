const fs = require('fs');

const EXCLUDED_FS = new Set([
  'tmpfs', 'devtmpfs', 'sysfs', 'proc', 'cgroup', 'cgroup2',
  'devpts', 'mqueue', 'hugetlbfs', 'pstore', 'securityfs',
  'debugfs', 'tracefs', 'overlay', 'squashfs', 'fuse.snapfuse',
  'nsfs', 'binfmt_misc', 'autofs', 'ramfs', 'configfs',
  'efivarfs', 'fusectl', 'rpc_pipefs', 'nfsd',
]);

function shortLabel(mountpoint) {
  if (mountpoint === '/') return 'root';
  // /media/devmon/sda2-ata-ST4000... → sda2
  const base = mountpoint.split('/').pop() || mountpoint;
  const m = base.match(/^(s[a-z]+\d+|nvme\d+n\d+p\d+|mmcblk\d+p\d+)/);
  return m ? m[1] : base.substring(0, 12);
}

function getStorageInfo() {
  const PROC_PATH = process.env.PROC_PATH || '/proc';
  const HOST_ROOT = process.env.HOST_ROOT || ''; // e.g. /host/root inside Docker
  let content;
  try {
    content = fs.readFileSync(`${PROC_PATH}/mounts`, 'utf8');
  } catch {
    return [];
  }

  const seen = new Set();
  const results = [];

  for (const line of content.split('\n')) {
    const parts = line.trim().split(/\s+/);
    if (parts.length < 3) continue;
    // /proc/mounts uses octal escapes (e.g. \040 for space). Unescape mountpoint:
    const [device, mountpointRaw, fstype] = parts;
    const mountpoint = mountpointRaw.replace(/\\([0-7]{3})/g, (_, o) => String.fromCharCode(parseInt(o, 8)));

    if (EXCLUDED_FS.has(fstype)) continue;

    // In Docker, host mounts are rslave-propagated under HOST_ROOT (e.g. /host/root).
    // Only consider mounts that live there so we don't count the container's own FS.
    // Outside Docker (HOST_ROOT empty), use the mountpoint as-is.
    let hostPath; // logical path on the host, used for filtering + display
    let statPath; // path we actually pass to statfs (must resolve in container)
    if (HOST_ROOT) {
      if (!mountpoint.startsWith(HOST_ROOT)) continue;
      hostPath = mountpoint === HOST_ROOT ? '/' : mountpoint.substring(HOST_ROOT.length);
      statPath = mountpoint;
    } else {
      hostPath = mountpoint;
      statPath = mountpoint;
    }

    if (hostPath.startsWith('/snap/')) continue;
    if (hostPath.startsWith('/sys/')) continue;
    if (hostPath.startsWith('/proc/')) continue;
    if (hostPath.startsWith('/dev/')) continue;
    if (hostPath.startsWith('/run/')) continue;
    if (hostPath.startsWith('/etc/')) continue;
    if (seen.has(device)) continue;

    try {
      const stat = fs.statfsSync(statPath);
      const total = stat.blocks * stat.bsize;
      const free  = stat.bavail * stat.bsize;
      const used  = total - (stat.bfree * stat.bsize);
      const usedPercent = total > 0 ? (used / total) * 100 : 0;

      // Skip tiny pseudo-filesystems (< 10 MB)
      if (total < 10 * 1024 * 1024) continue;

      seen.add(device);
      results.push({
        mountpoint: hostPath,
        label: shortLabel(hostPath),
        total,
        used,
        free,
        usedPercent,
      });
    } catch {}
  }

  return results;
}

module.exports = { getStorageInfo };
