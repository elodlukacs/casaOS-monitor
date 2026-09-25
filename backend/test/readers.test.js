// Readers against a fake /proc and /sys. Run with `npm test` in backend/.
const { test, after } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const os = require('os');

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'casaos-monitor-test-'));
const P = path.join(root, 'proc');
const S = path.join(root, 'sys');
process.env.PROC_PATH = P;
process.env.SYS_PATH = S;
after(() => fs.rmSync(root, { recursive: true, force: true }));

function w(file, text) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
}

test('network: default-route interface first, busiest as fallback', () => {
  const dev = `Inter-|   Receive  |  Transmit
 face |bytes    packets errs drop fifo frame compressed multicast|bytes    packets errs drop fifo colls carrier compressed
    lo: 100 1 0 0 0 0 0 0 100 1 0 0 0 0 0 0
wlp1s0: 1000 10 0 0 0 0 0 0 1000 10 0 0 0 0 0 0
tailscale0: 999999999 10 0 0 0 0 0 0 5 10 0 0 0 0 0 0
enp2s0: 5000 10 0 0 0 0 0 0 5000 10 0 0 0 0 0 0
docker0: 1 0 0 0 0 0 0 0 1 0 0 0 0 0 0 0
`;
  w(`${P}/net/dev`, dev);
  w(`${P}/net/route`, [
    'Iface\tDestination\tGateway\tFlags\tRefCnt\tUse\tMetric\tMask',
    'wlp1s0\t00000000\t0101A8C0\t0003\t0\t0\t600\t00000000',
    'enp2s0\t00000000\t0101A8C0\t0003\t0\t0\t100\t00000000',
    'enp2s0\t0001A8C0\t00000000\t0001\t0\t0\t100\t00FFFFFF',
  ].join('\n') + '\n');
  const { getNetworkInfo } = require('../readers/network');
  assert.deepStrictEqual(getNetworkInfo().map(n => n.iface), ['enp2s0', 'wlp1s0', 'tailscale0']);

  w(`${P}/net/route`, 'Iface\tDestination\tGateway\tFlags\tRefCnt\tUse\tMetric\tMask\n');
  assert.strictEqual(getNetworkInfo()[0].iface, 'tailscale0');
});

test('processes: top N per sort key, still ordered by cpu', () => {
  const stat = (pid, name, state, ticks, rssPages) =>
    `${pid} (${name}) ${state} 1 1 1 0 -1 0 0 0 0 0 ${ticks} 0 0 0 20 0 1 0 100 ${rssPages * 4096} ${rssPages} 18446744073709551615`;
  const write = tick => {
    for (let i = 0; i < 50; i++) {
      const pid = 1000 + i;
      w(`${P}/${pid}/stat`, stat(pid, `busy ${i}`, 'R', tick * (i + 1), 100));
      w(`${P}/${pid}/io`, 'read_bytes: 0\nwrite_bytes: 0\n');
    }
    w(`${P}/5000/stat`, stat(5000, 'Plex Media Serv', 'S', 7, 2_000_000)); // big and idle
    w(`${P}/5000/io`, 'read_bytes: 0\nwrite_bytes: 0\n');
    w(`${P}/6000/stat`, stat(6000, 'rsync', 'D', 3, 50)); // I/O only
    w(`${P}/6000/io`, `read_bytes: ${tick * 1e6}\nwrite_bytes: 0\n`);
  };
  const { getProcesses } = require('../readers/processes');
  write(1);
  getProcesses();
  write(2);
  const list = getProcesses();

  const plex = list.find(p => p.pid === 5000);
  assert.ok(plex, 'idle big-memory process kept');
  assert.strictEqual(plex.memBytes, 2_000_000 * 4096);
  assert.strictEqual(plex.state, 'S');
  assert.strictEqual(plex.name, 'Plex Media Serv');
  assert.ok(list.find(p => p.pid === 6000), 'I/O-only process kept');
  for (let i = 1; i < list.length; i++) assert.ok(list[i - 1].cpuPercent >= list[i].cpuPercent);
  assert.strictEqual(list[0].pid, 1049);
});

test('temperature: duplicates dropped, coretemp package is the cpu temp', () => {
  w(`${S}/class/thermal/thermal_zone0/type`, 'acpitz');
  w(`${S}/class/thermal/thermal_zone0/temp`, '27800');
  w(`${S}/class/thermal/thermal_zone1/type`, 'x86_pkg_temp');
  w(`${S}/class/thermal/thermal_zone1/temp`, '61000');
  w(`${S}/class/hwmon/hwmon0/name`, 'acpitz');
  w(`${S}/class/hwmon/hwmon0/temp1_input`, '27800');
  w(`${S}/class/hwmon/hwmon1/name`, 'coretemp');
  w(`${S}/class/hwmon/hwmon1/temp1_input`, '60000');
  w(`${S}/class/hwmon/hwmon1/temp1_label`, 'Package id 0');
  w(`${S}/class/hwmon/hwmon1/temp2_input`, '55000');
  w(`${S}/class/hwmon/hwmon1/temp2_label`, 'Core 0');
  w(`${S}/class/hwmon/hwmon1/temp10_input`, '52000');
  w(`${S}/class/hwmon/hwmon1/temp10_label`, 'Core 8');
  w(`${S}/class/hwmon/hwmon2/name`, 'drivetemp');
  w(`${S}/class/hwmon/hwmon2/temp1_input`, '41000');
  const t = require('../readers/temperature').getTemperatures();
  assert.deepStrictEqual(t.all.map(x => x.label), [
    'acpitz/acpitz',
    'coretemp/Package id 0',
    'coretemp/Core 0',
    'coretemp/Core 8',
    'drivetemp/drivetemp',
  ]);
  assert.strictEqual(t.cpu, 60);
  assert.strictEqual(t.cpuLabel, 'coretemp/Package id 0');
});

test('cooling: sorted by chip then channel, pwm mode decoded', () => {
  const d = `${S}/class/hwmon/hwmon3`;
  w(`${d}/name`, 'it8613');
  w(`${d}/fan1_input`, '1500');
  w(`${d}/fan10_input`, '900');
  w(`${d}/fan10_label`, 'CPU Fan');
  w(`${d}/fan2_input`, '0');
  w(`${d}/pwm1`, '128');
  w(`${d}/pwm1_enable`, '2');
  const c = require('../readers/cooling').getCooling();
  assert.deepStrictEqual(c.fans.map(f => f.label), ['it8613/fan1', 'it8613/fan2', 'it8613/CPU Fan']);
  assert.deepStrictEqual(c.controls, [{ label: 'it8613/pwm1', percent: 50, mode: 'auto' }]);
});

test('storage: network mounts skipped, usage as df computes it', () => {
  w(`${P}/mounts`, [
    `/dev/sda1 ${root} ext4 rw 0 0`,
    `nas:/export ${S} nfs4 rw 0 0`,
    `//nas/share ${P} cifs rw 0 0`,
  ].join('\n') + '\n');
  const list = require('../readers/storage').getStorageInfo();
  assert.strictEqual(list.length, 1);
  const s = list[0];
  assert.ok(Math.abs(s.usedPercent - (s.used / (s.used + s.free)) * 100) < 1e-9);
});
