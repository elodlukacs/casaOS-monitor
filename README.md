# casaOS-monitor

A btop-style system monitor for a CasaOS / Ubuntu home server: CPU (with
frequency), memory, disks, network, temperatures and fans, Docker containers
and processes, in the browser and in an Android app.

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

Optional settings go in a `.env` file next to `docker-compose.yml`:

```bash
cp .env.example .env
nano .env
docker compose up -d
```

`.env` is gitignored, so tokens never end up in git, and `git pull` leaves it
alone. Anything left empty is off.

| variable | default | meaning |
|---|---|---|
| `ALLOWED_ORIGINS` | empty | Extra browser origins allowed to connect, comma separated. Needed only when you open the dashboard through a reverse proxy or another host name, e.g. `https://monitor.example.com`. |
| `MONITOR_TOKEN` | empty (off) | Shared secret. Open the page once as `http://<server>:3030/?token=<value>`; the browser remembers it. **The Android app cannot send a token and stops connecting while this is set.** |
| `NTFY_URL`, `NTFY_TOKEN` | empty | Phone alerts through ntfy, see below |
| `DISCORD_WEBHOOK_URL` | empty | Alerts to a Discord channel |
| `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` | empty | Alerts through a Telegram bot |
| `ALERT_LEVEL` | `crit` | `warn` also sends the yellow-level problems |
| `ALERT_AFTER_SECONDS` | `60` | How long a problem must last before an alert |
| `ALERT_REPEAT_HOURS` | `6` | Repeat interval while it lasts |
| `PLEX_URL`, `PLEX_TOKEN` | empty | Plex now-playing panel, see below |

Fixed in `docker-compose.yml`: `PORT` (3030) and `DOCKER_HOST` (the proxy;
remove it to hide the container panel).

Browsers are only accepted from the address the dashboard is served from,
from `localhost` (the Android app, local development) and from
`ALLOWED_ORIGINS`. This stops other web sites opened on your network from
reading the dashboard's data.

### Phone alerts

The server checks every second, whether or not anyone has the page open, and
notifies when one of these lasts a minute:

- a disk is 90% full or more
- CPU at 80 °C, a hard drive at 55 °C, another sensor at 85 °C
- memory 95% used
- a container restarting, dead or unhealthy

It repeats every 6 hours while the problem lasts and sends a "resolved"
message once it is gone. `ALERT_LEVEL=warn` also sends the yellow levels.

The easiest channel is [ntfy](https://ntfy.sh): install the app, subscribe to
a long random topic name (anyone who knows the name can read it), and set
`NTFY_URL=https://ntfy.sh/<that-topic>`. Then send a test:

```bash
docker exec casaos-monitor node backend/alerts.js --test
```

### Plex

Shows who is watching what, and whether each stream is direct play, direct
stream, or a transcode on the GPU (hw) or the CPU.

1. Find the token. On the server:
   ```bash
   sudo grep -o 'PlexOnlineToken="[^"]*"' "$(sudo find / -name Preferences.xml -path '*Plex Media Server*' 2>/dev/null | head -1)"
   ```
   Or in Plex Web: open any movie → ⋯ → Get Info → View XML; the address has
   `X-Plex-Token=…`.
2. In `.env`: `PLEX_URL=http://127.0.0.1:32400` and `PLEX_TOKEN=<token>`, then
   `docker compose up -d`.

Anyone who can open the dashboard sees who is watching what. If that matters,
set `MONITOR_TOKEN` or keep port 3030 closed to the internet.

### GPU

Intel iGPUs (i915) show their clock and how much of the time they are awake;
AMD GPUs show busy %. Running transcoders (Plex, Jellyfin/Emby ffmpeg,
HandBrake) are listed as on the GPU or on the CPU, and with Linux 5.19 or
newer the video engine load they cause is shown too. No setup needed.

### Troubleshooting

- **Container panel says "docker API not reachable"**: check
  `docker logs casaos-monitor-docker-proxy`. On hosts where AppArmor/SELinux
  blocks the proxy from the socket, add `privileged: true` to the
  `docker-proxy` service.
- **Page stays on "connecting…"**: `docker logs casaos-monitor` shows
  rejected origins; add yours to `ALLOWED_ORIGINS`. If `MONITOR_TOKEN` is set,
  open the page with `?token=…`.
- **Health**: `docker ps` shows `(healthy)` while the sampler runs;
  `curl http://127.0.0.1:3030/healthz` answers 503 if it stopped.
- **No alerts arrive**: run the `--test` command above; `docker logs
  casaos-monitor` shows `alerts on via …` at start and any delivery errors.
- **Plex panel shows an error**: a 401 means the token is wrong; a timeout
  means `PLEX_URL` is wrong (Plex must be reachable from the host on that
  address).

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
