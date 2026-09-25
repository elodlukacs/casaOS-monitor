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

Set these under `environment:` of `casaos-monitor` in `docker-compose.yml`.

| variable | default | meaning |
|---|---|---|
| `PORT` | `3030` | HTTP / WebSocket port |
| `DOCKER_HOST` | `tcp://127.0.0.1:2375` | Docker API (the proxy). Remove to hide the container panel. |
| `ALLOWED_ORIGINS` | empty | Extra browser origins allowed to connect, comma separated. Needed only when you open the dashboard through a reverse proxy or another host name, e.g. `https://monitor.example.com`. |
| `MONITOR_TOKEN` | empty (off) | Shared secret. Open the page once as `http://<server>:3030/?token=<value>`; the browser remembers it. **The Android app cannot send a token and stops connecting while this is set.** |

Browsers are only accepted from the address the dashboard is served from,
from `localhost` (the Android app, local development) and from
`ALLOWED_ORIGINS`. This stops other web sites opened on your network from
reading the dashboard's data.

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
