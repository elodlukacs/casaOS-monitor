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
    if (mountpoint.startsWith('/snap/')) continue;
    if (mountpoint.startsWith('/sys/')) continue;
    if (mountpoint.startsWith('/proc/')) continue;
    if (mountpoint.startsWith('/dev/')) continue;
    if (mountpoint.startsWith('/run/')) continue;
    // Skip container's internal bind paths (just resolv.conf/etc. from host)
    if (mountpoint.startsWith('/etc/')) continue;
    if (seen.has(device)) continue;

    // Resolve path to statfs: in Docker we must statfs via HOST_ROOT prefix
    // because the host mount target does not exist inside the container.
    const statPath = HOST_ROOT
      ? (mountpoint === '/' ? HOST_ROOT : HOST_ROOT + mountpoint)
      : mountpoint;

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
        mountpoint,
        label: shortLabel(mountpoint),
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
