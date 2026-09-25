const { test } = require('node:test');
const assert = require('node:assert');
const { originAllowed, tokenOk } = require('../access');

test('origin: same host, localhost and allow-list only', () => {
  assert.ok(originAllowed(undefined, 'nas:3030'), 'non-browser client');
  assert.ok(originAllowed('http://192.168.1.10:3030', '192.168.1.10:3030'), 'dashboard served by us');
  assert.ok(originAllowed('https://localhost', '192.168.1.10:3030'), 'Android app WebView');
  assert.ok(originAllowed('http://localhost:5173', 'localhost:3030'), 'vite dev');
  assert.ok(!originAllowed('https://evil.example', '192.168.1.10:3030'));
  assert.ok(!originAllowed('http://192.168.1.10:8080', '192.168.1.10:3030'), 'other port on the NAS');
  assert.ok(!originAllowed('null', '192.168.1.10:3030'));
  assert.ok(originAllowed('https://monitor.example.com', 'casaos-monitor:3030', ['https://monitor.example.com']));
});

test('token: off unless set, then must match', () => {
  assert.ok(tokenOk('/', ''));
  assert.ok(tokenOk('/?token=s3cret', 's3cret'));
  assert.ok(!tokenOk('/', 's3cret'));
  assert.ok(!tokenOk('/?token=wrong', 's3cret'));
});
