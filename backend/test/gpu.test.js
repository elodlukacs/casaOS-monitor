// GPU reader against a fake sysfs and /proc.
const { test, after } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const os = require('os');

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'casaos-monitor-gpu-'));
const P = path.join(root, 'proc');
const S = path.join(root, 'sys');
process.env.PROC_PATH = P;
process.env.SYS_PATH = S;
after(() => fs.rmSync(root, { recursive: true, force: true }));

function w(file, text) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

test('gpu: i915 clocks, awake % and transcoder video engine load', async () => {
  const card = `${S}/class/drm/card0`;
  w(`${card}/gt_act_freq_mhz`, '450');
  w(`${card}/gt_RP0_freq_mhz`, '800');
  w(`${card}/gt_RPn_freq_mhz`, '100');
  w(`${card}/power/rc6_residency_ms`, '10000');
  fs.mkdirSync(`${S}/class/drm/card0-HDMI-A-1`, { recursive: true }); // connector, ignored

  const drmInfo = (videoNs, renderNs) =>
    `pos:\t0\nflags:\t02100002\ndrm-driver:\ti915\ndrm-pdev:\t0000:00:02.0\ndrm-client-id:\t7\n` +
    `drm-engine-render:\t${renderNs} ns\ndrm-engine-video:\t${videoNs} ns\ndrm-engine-capacity-video:\t1\n`;
  w(`${P}/4242/comm`, 'Plex Transcoder\n');
  w(`${P}/4242/fdinfo/5`, drmInfo(0, 0));
  w(`${P}/4242/fdinfo/6`, drmInfo(0, 0)); // same client id: counted once
  w(`${P}/4242/fdinfo/0`, 'pos:\t0\nflags:\t0\n');
  w(`${P}/100/comm`, 'sshd\n');

  const { getGpu } = require('../readers/gpu');
  const first = getGpu();
  assert.strictEqual(first.card, 'card0');
  assert.strictEqual(first.freqMhz, 450);
  assert.strictEqual(first.maxMhz, 800);
  assert.strictEqual(first.transcoders, 1);
  assert.strictEqual(first.transcodersOnGpu, 1);
  assert.strictEqual(first.engineStats, true);
  assert.strictEqual(first.engines, null, 'no baseline yet');

  await sleep(200);
  const dtMs = 200;
  // video engine busy for ~half the interval, GPU in RC6 for ~a quarter of it
  w(`${P}/4242/fdinfo/5`, drmInfo(dtMs * 1e6 * 0.5, 0));
  w(`${P}/4242/fdinfo/6`, drmInfo(dtMs * 1e6 * 0.5, 0));
  w(`${card}/power/rc6_residency_ms`, String(10000 + dtMs * 0.25));
  const second = getGpu();
  assert.ok(second.engines.video > 35 && second.engines.video <= 50, `video ${second.engines.video}`);
  assert.strictEqual(second.engines.render, 0);
  assert.ok(second.awakePercent > 70 && second.awakePercent <= 80, `awake ${second.awakePercent}`);
});
