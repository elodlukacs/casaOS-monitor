# casaOS-monitor

A btop-style system monitor for a CasaOS / Ubuntu home server: CPU (with
frequency and iowait), memory, disks, network, GPU, temperatures and fans,
Docker containers and processes, plus active qBittorrent transfers and Plex
now-playing and library counts, in the browser and in an Android app.

It reads `/proc` and `/sys` of the host from inside a container and streams
the numbers over a WebSocket. It only reads; it never changes anything on the
host.

## Install

```bash
git clone https://github.com/elodlukacs/casaOS-monitor.git
cd casaOS-monitor
docker compose up -d --build
```

Open `http://<server-ip>:3030`.

This starts two containers:

| container | what it does |
|---|---|
| `casaos-monitor` | the monitor (host network, read-only view of `/proc`, `/sys` and `/`) |
| `casaos-monitor-docker-proxy` | lets the monitor list containers and read their stats, nothing else |

The proxy exists so the monitor never gets `docker.sock` itself: whoever can
talk to that socket controls the host, and mounting it `:ro` does not change
that. The proxy only listens on `127.0.0.1:2375`.

## Update

```bash
cd casaOS-monitor
git pull
docker compose up -d --build
```

To go back to an earlier version: `git checkout <commit>` and run the same
`docker compose up -d --build`.

## Configuration

Set these under `environment:` of `casaos-monitor` in `docker-compose.yml`.

| variable | default | meaning |
|---|---|---|
| `PORT` | `3030` | HTTP / WebSocket port |
| `DOCKER_HOST` | `tcp://127.0.0.1:2375` | Docker API (the proxy). Remove to hide the container panel. |
| `ALLOWED_ORIGINS` | empty | Extra browser origins allowed to connect, comma separated. Needed only when you open the dashboard through a reverse proxy or another host name, e.g. `https://monitor.example.com`. |
| `MONITOR_TOKEN` | empty (off) | Shared secret. Open the page once as `http://<server>:3030/?token=<value>`; the browser remembers it. **The Android app cannot send a token and stops connecting while this is set.** |
| `QBIT_URL` | `http://localhost:8181` | qBittorrent WebUI for the torrents panel. Remove to hide the panel. See below. |
| `PLEX_URL` | server LAN IP, port 32400 | Plex Media Server for the Plex panel. Remove to hide the panel. See below. |
| `PLEX_TOKEN` | empty | Optional; read from a gitignored `.env` next to `docker-compose.yml` (`PLEX_TOKEN=…`). Not needed with an allowed network, see below. |

Browsers are only accepted from the address the dashboard is served from,
from `localhost` (the Android app, local development) and from
`ALLOWED_ORIGINS`. This stops other web sites opened on your network from
reading the dashboard's data.

### qBittorrent

The torrents panel lists torrents that are transferring (a torrent that goes
quiet stays, dimmed, for 10 s), with done %, speeds and ETA; hover a row for
size, peers and ratio. The footer has the global speeds and the totals since
qBittorrent started.

No login is sent. In qBittorrent, Options → WebUI → *Bypass authentication for
clients in whitelisted IP subnets*, add `172.16.0.0/12`: the monitor uses the
host network, so its requests reach a bridge-networked qBittorrent from the
Docker gateway (`172.x.0.1`).

### Plex

Who is watching what: progress, player, direct play / direct stream /
transcode and bandwidth, plus item counts per library (movies; shows and
episodes; artists, albums and tracks), refreshed every 5 minutes.

Without a token: Plex Settings → Network → *Show Advanced* → *List of IP
addresses and networks that are allowed without auth*, add the address Plex
sees the monitor as, and set `PLEX_URL` to match:

- host-networked Plex (`docker inspect plex --format '{{.HostConfig.NetworkMode}}'`
  says `host`): the server's LAN IP, e.g. `192.168.1.238`, and
  `PLEX_URL=http://192.168.1.238:32400`. **Not `127.0.0.1`**: Plex treats
  loopback requests separately and answers 401 even when it is on the list.
- bridge-networked Plex: `172.16.0.0/255.240.0.0`.

With a token instead: `PLEX_TOKEN=<token>` in `.env`. It is in Plex's
`Preferences.xml` as `PlexOnlineToken`, or in Plex Web → any item → ⋯ → Get
Info → View XML (`X-Plex-Token=…` in the address). The token is full access to
the Plex account, so keep it out of `docker-compose.yml`.

### GPU

Intel iGPUs (i915) show their clock and how much of the time they are awake;
AMD GPUs show busy %. Running transcoders (Plex, Jellyfin/Emby ffmpeg,
HandBrake) are listed as on the GPU or on the CPU, and with Linux 5.19 or
newer the video engine load they cause is shown too. No setup needed; the
panel is hidden when no GPU is readable.

### Troubleshooting

- **Container panel says "docker API not reachable"**: check
  `docker logs casaos-monitor-docker-proxy`. On hosts where AppArmor/SELinux
  blocks the proxy from the socket, add `privileged: true` to the
  `docker-proxy` service.
- **Page stays on "connecting…"**: `docker logs casaos-monitor` shows
  rejected origins; add yours to `ALLOWED_ORIGINS`. If `MONITOR_TOKEN` is set,
  open the page with `?token=…`.
- **Torrents panel shows HTTP 403**: the qBittorrent auth bypass whitelist
  above is missing or doesn't cover the monitor's address.
- **Plex panel shows HTTP 401**: the address isn't on Plex's allowed list, or
  `PLEX_URL` uses `localhost`/`127.0.0.1` (see above). `docker exec plex grep
  status/sessions "/config/Library/Application Support/Plex Media Server/Logs/Plex Media Server.log" | tail -2`
  shows the address Plex saw and how it classified it.
- **Health**: `docker ps` shows `(healthy)` while the sampler runs;
  `curl http://127.0.0.1:3030/healthz` answers 503 if it stopped.

## Android app

Download `casaos-monitor-debug` from the latest run of the *Build Android APK*
workflow (Actions tab), install it, and enter `<server-ip>:3030`.

## Development

```bash
cd backend && npm ci && npm test      # reader tests against a fake /proc and /sys
cd frontend && npm ci && npm run dev  # connects to ws://localhost:3030
```

The backend runs on Linux only (it reads `/proc`). `PROC_PATH`, `SYS_PATH` and
`HOST_ROOT` point it at other locations.

### WebSocket protocol

- The server sends a `metrics` frame every interval.
- The client may send `{"type":"setInterval","ms":1000}` (100 to 10000) and
  `{"type":"getHistory"}` (answered with one `history` message: the last hour
  at 1 s).
- The Android app treats every message as a metrics frame. **Any new message
  type the server sends must be opt-in**, requested by the client first, the
  way `history` is. New fields in the metrics frame are fine.
