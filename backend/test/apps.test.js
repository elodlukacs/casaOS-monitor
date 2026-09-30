// qBittorrent and Plex readers against fake WebUI / Plex servers.
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const http = require('http');

const sleep = ms => new Promise(r => setTimeout(r, ms));

// One fake server for both apps; `routes` maps a path (without query) to a
// handler returning [status, body].
const routes = {};
const seen = [];
const server = http.createServer((req, res) => {
  seen.push(req.url);
  const u = new URL(req.url, 'http://x');
  const route = routes[u.pathname];
  const [status, body] = route ? route(u) : [404, null];
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(body === null ? '' : JSON.stringify(body));
});

let qbit;
let plex;
before(async () => {
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  // Readers read their URL once, at require time.
  process.env.QBIT_URL = `${base}/`;
  process.env.PLEX_URL = base;
  qbit = require('../readers/qbittorrent');
  plex = require('../readers/plex');
});
after(() => server.close());

test('qbittorrent: only torrents with traffic, global rates and session totals', async () => {
  routes['/api/v2/transfer/info'] = () => [200, { dl_info_speed: 5000, up_info_speed: 300, dl_info_data: 1e9, up_info_data: 2e8 }];
  routes['/api/v2/torrents/info'] = () => [200, [
    { hash: 'a', name: 'slow', state: 'downloading', progress: 0.5, size: 100, dlspeed: 10, upspeed: 0, eta: 60, num_seeds: 1, num_leechs: 2, ratio: 0 },
    { hash: 'b', name: 'fast', state: 'uploading', progress: 1, size: 200, dlspeed: 0, upspeed: 900, eta: 8640000, num_seeds: 0, num_leechs: 4, ratio: 2 },
    { hash: 'c', name: 'stalled', state: 'stalledDL', progress: 0.1, size: 300, dlspeed: 0, upspeed: 0, eta: 8640000, num_seeds: 0, num_leechs: 0, ratio: 0 },
  ]];
  assert.ok(qbit.qbitConfigured());
  const q = await qbit.getTorrents();
  assert.deepStrictEqual([q.dlSpeed, q.upSpeed, q.dlTotal, q.upTotal], [5000, 300, 1e9, 2e8]);
  assert.deepStrictEqual(q.torrents.map(t => t.name), ['fast', 'slow'], 'sorted by total speed, idle one left out');
  assert.strictEqual(q.torrents[0].eta, null, "qBittorrent's 8640000 means unknown");
  assert.ok(seen.includes('/api/v2/torrents/info?filter=active'), 'trailing slash in QBIT_URL handled');
});

test('qbittorrent: 403 names the whitelist', async () => {
  routes['/api/v2/transfer/info'] = () => [403, null];
  await assert.rejects(qbit.getTorrents(), /403.*whitelist/);
});

test('plex: sessions mapped, library counts fetched without items', async () => {
  routes['/status/sessions'] = () => [200, {
    MediaContainer: {
      size: 2,
      Metadata: [
        {
          type: 'episode', grandparentTitle: 'Lanterns', parentIndex: 1, index: 7, title: 'The Jordan Boys Legacy',
          duration: 2833248, viewOffset: 154000, sessionKey: '45',
          User: { title: 'elod' }, Player: { title: 'Living Room TV', state: 'playing' },
          Session: { id: 's1', bandwidth: 4163, location: 'lan' },
          TranscodeSession: { videoDecision: 'copy', audioDecision: 'transcode' },
        },
        {
          type: 'movie', title: 'Heat', year: 1995, duration: 1000, viewOffset: 500, sessionKey: '46',
          User: { title: 'anna' }, Player: { product: 'Plex for iOS', state: 'paused' },
          Session: { id: 's2', location: 'wan' },
        },
      ],
    },
  }];
  routes['/library/sections'] = () => [200, { MediaContainer: { Directory: [
    { key: '1', title: 'Movies', type: 'movie' },
    { key: '6', title: 'TVShowZ', type: 'show' },
  ] } }];
  const totals = { '1:': 1234, '6:': 85, '6:4': 4321 };
  for (const key of ['1', '6']) {
    routes[`/library/sections/${key}/all`] = u => {
      assert.strictEqual(u.searchParams.get('X-Plex-Container-Size'), '0', 'counts must not fetch items');
      return [200, { MediaContainer: { size: 0, totalSize: totals[`${key}:${u.searchParams.get('type') || ''}`] } }];
    };
  }

  assert.ok(plex.plexConfigured());
  const first = await plex.getSessions();
  assert.deepStrictEqual(
    first.sessions.map(s => [s.user, s.parent, s.season, s.episode, s.title, s.state, s.decision, s.local]),
    [
      ['anna', null, null, null, 'Heat', 'paused', 'direct play', false],
      ['elod', 'Lanterns', 1, 7, 'The Jordan Boys Legacy', 'playing', 'transcode', true],
    ],
  );
  assert.strictEqual(first.sessions[1].player, 'Living Room TV');
  assert.strictEqual(first.sessions[0].player, 'Plex for iOS');

  // Libraries load off the sessions path; the next poll carries them.
  await sleep(100);
  const second = await plex.getSessions();
  assert.deepStrictEqual(second.libraries.map(l => [l.title, l.counts.map(c => `${c.n} ${c.label}`)]), [
    ['Movies', ['1234 movies']],
    ['TVShowZ', ['85 shows', '4321 episodes']],
  ]);
  // A paused session doesn't advance; a playing one never goes backwards.
  assert.strictEqual(second.sessions[0].offset, 500);
  assert.ok(second.sessions[1].offset >= 154000);
});

test('plex: 401 explains the auth options', async () => {
  routes['/status/sessions'] = () => [401, null];
  await assert.rejects(plex.getSessions(), /401.*PLEX_TOKEN/);
});
