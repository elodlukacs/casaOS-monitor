const { test } = require('node:test');
const assert = require('node:assert');
const { createAlerter, problems } = require('../alerts');

const GiB = 1024 ** 3;
const base = () => ({
  temperature: { cpu: 50, all: [{ label: 'drivetemp/drivetemp', celsius: 40 }] },
  memory: { total: 8 * GiB, usedPercent: 40 },
  storage: [{ mountpoint: '/DATA', total: 4000 * GiB, usedPercent: 50 }],
  docker: [{ name: 'plex', state: 'running', status: 'Up 2 days' }],
});

test('problems: crit conditions only by default', () => {
  const m = base();
  assert.deepStrictEqual(problems(m), []);
  m.temperature.all[0].celsius = 56; // HDD over 55
  m.storage[0].usedPercent = 85;     // warn only
  m.docker[0].status = 'Up 2 days (unhealthy)';
  assert.deepStrictEqual(problems(m).map(p => p.key), ['temp:drivetemp/drivetemp', 'ctr:plex']);
});

test('alerter: waits, notifies once, repeats, resolves', () => {
  let t = 0;
  const sent = [];
  const alerter = createAlerter({
    hostname: 'nas',
    now: () => t,
    list: [{ name: 'fake', send: async msg => { sent.push(msg); } }],
  });
  const bad = base();
  bad.storage[0].usedPercent = 96;

  alerter.check(bad);
  t = 30_000;
  alerter.check(bad);
  assert.strictEqual(sent.length, 0, 'not before 60s');

  t = 61_000;
  alerter.check(bad);
  assert.strictEqual(sent.length, 1);
  assert.deepStrictEqual(sent[0], { title: 'nas: problem', text: '/DATA is 96% full' });

  t = 3600_000;
  alerter.check(bad);
  assert.strictEqual(sent.length, 1, 'no repeat within 6h');
  t = 61_000 + 6 * 3600_000;
  alerter.check(bad);
  assert.strictEqual(sent.length, 2, 'repeat after 6h');

  const good = base();
  t += 1000;
  alerter.check(good);
  t += 30_000;
  alerter.check(bad); // back over the line before 60s clear: no resolve, no new alert
  t += 1000;
  alerter.check(good);
  t += 61_000;
  alerter.check(good);
  assert.strictEqual(sent.length, 3);
  assert.strictEqual(sent[2].title, 'nas: resolved');
  assert.strictEqual(sent[2].text, '/DATA usage back to normal (was: /DATA is 96% full)');
  assert.strictEqual(sent[2].resolved, true);
});

test('alerter: a short blip is never reported', () => {
  let t = 0;
  const sent = [];
  const alerter = createAlerter({ hostname: 'nas', now: () => t, list: [{ name: 'fake', send: async m => { sent.push(m); } }] });
  const bad = base();
  bad.temperature.cpu = 90;
  alerter.check(bad);
  t = 20_000;
  alerter.check(base());
  t = 200_000;
  alerter.check(base());
  assert.strictEqual(sent.length, 0);
});

test('problems: the sensor the CPU value comes from is not reported twice', () => {
  const m = base();
  m.temperature = { cpu: 91, cpuLabel: 'coretemp/Package id 0', all: [{ label: 'coretemp/Package id 0', celsius: 91 }] };
  assert.deepStrictEqual(problems(m).map(p => p.key), ['temp:cpu']);
});
