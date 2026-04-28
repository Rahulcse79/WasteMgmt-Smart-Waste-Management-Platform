# Smart Waste Management Platform

Production-grade IoT + dashboard stack inspired by Gujarat / Nagpur smart-city
deployments. Designed to scale to **30,000+ devices** with secure MQTT
ingestion, real-time WebSocket streaming, role-based access, an admin-driven
rules engine and built-in audit logging.

> © 2026 Rahul Singh — MIT licensed.

---

## ✨ Features

| Area | What you get |
| --- | --- |
| **Auth** | JWT access + rotating refresh tokens, bcrypt-12 hashing, optional AES-256-GCM payload encryption, RBAC (`admin` / `user`) |
| **IoT ingest** | MQTT-over-TLS subscriber for `oneM2M` payloads (`/oneM2M/resp/#`) — parses `pc.m2m:cin` and stores both bounded rolling windows and a MongoDB time-series archive |
| **Realtime** | Native WebSocket hub (`/ws`) with per-topic subscribe/unsubscribe |
| **Dashboard** | Dark-theme Next.js 16 UI matching the reference deployment: live table, Leaflet map with fill-level colour markers, per-bin detail with 4 charts + map popup, surveillance feeds |
| **Admin panel** | Dustbin / user / rule / settings CRUD, audit log explorer, dynamic camera + MQTT broker reconfiguration |
| **Alerts** | Built-in safety thresholds + admin rules engine (per-metric operator/threshold, cooldown, optional email) |
| **Prediction** | Linear regression forecast of bin-full ETA from recent depth history |
| **Health** | Heartbeat monitor → marks devices offline + raises `OFFLINE` alert |
| **Audit** | Every privileged action logged with actor, IP, diff |
| **Infra** | Multi-stage Dockerfiles, docker-compose, hardened nginx (TLS, HSTS, WS proxy), HPA-ready k8s manifest |

See [`ARCHITECTURE.md`](ARCHITECTURE.md) for the full design — endpoints,
data model, scaling strategy, and security implementation.

---

## 📁 Repository layout

```
.
├── wastemgmt_api/      Node.js + TypeScript backend (Fastify · Mongoose · MQTT · WS)
├── wastemgmt_ui/       Next.js 16 · React 19 · Tailwind v4 dashboard
├── wastemgmt_server/   (Optional, empty Rust scratch — left untouched)
├── infra/
│   ├── docker/         docker-compose + nginx reverse proxy
│   └── k8s/            Kubernetes deployment + HPA
├── ARCHITECTURE.md
├── LICENSE             MIT (Rahul Singh, 2026)
└── README.md
```

---

## 🚀 Quick start

### 1. Clone + install

```bash
git clone <this-repo> wastemgmt && cd wastemgmt
cp .env.example .env

cd wastemgmt_api && cp .env.example .env && npm install
cd ../wastemgmt_ui && cp .env.example .env.local && npm install
```

### 2. Generate strong secrets

```bash
openssl rand -hex 64    # → JWT_ACCESS_SECRET
openssl rand -hex 64    # → JWT_REFRESH_SECRET
openssl rand -hex 32    # → PAYLOAD_ENC_KEY
```

Paste into `wastemgmt_api/.env`.

### 3. Run dev

```bash
# terminal 1
cd wastemgmt_api && npm run dev      # http://localhost:3023

# terminal 2
cd wastemgmt_ui  && npm run dev      # http://localhost:3000
```

Sign in at <http://localhost:3000/login>:

| User | Password | Role |
| --- | --- | --- |
| `admin` | `admin` | full access |
| `user` | `user` | read-only |

> **Change both immediately** in production via *Admin → Users → Reset password*.

### 4. Production with Docker

```bash
cd infra/docker
# put TLS cert/key into ./certs/{fullchain.pem,privkey.pem}
docker compose up -d --build
```

The stack publishes:
- `https://<host>/`            → Next.js UI
- `https://<host>/auth/...`    → Fastify API
- `wss://<host>/ws`            → WebSocket hub

---

## 📡 MQTT ingest

The backend subscribes to `MQTT_TOPIC` (default `/oneM2M/resp/#`) over TLS,
authenticated with the cert/key/CA you provide via env vars:

```
MQTT_HOST=ccsp.m2m.minfoway.com
MQTT_PORT=8883
MQTT_PROTOCOL=mqtts
MQTT_CA_CERT=/etc/iotmqttcerts/ca.crt
MQTT_CLIENT_CERT=/etc/iotmqttcerts/SOTcorws-01.crt
MQTT_CLIENT_KEY=/etc/iotmqttcerts/SOTcorws-01.key
MQTT_CLIENT_ID=SOTcorws-01
```

Payloads are parsed as:

```
deviceId  = pc.m2m:cin.cr
timestamp = pc.m2m:cin.ct          (YYYYMMDDTHHmmss)
metrics   = pc.m2m:cin.con         (depth, gas, humidity, temperature, ...)
```

Each reading is:
1. appended to the dustbin's bounded rolling window (last 200 points),
2. inserted into the `SensorReading` MongoDB **time-series collection** for analytics + 90 day retention,
3. broadcast to subscribed WebSocket clients,
4. evaluated against built-in thresholds + admin rules.

---

## 🔌 REST API (selected)

| Method | Path | Auth |
| --- | --- | --- |
| `POST` | `/auth/login` | public |
| `POST` | `/auth/refresh` | public |
| `POST` | `/auth/logout` | bearer |
| `GET`  | `/auth/me` | bearer |
| `GET`  | `/dustbins` | bearer (scoped by role) |
| `GET`  | `/dustbins/:id` | bearer |
| `GET`  | `/dustbins/:id/predict` | bearer |
| `POST` `PUT` `DELETE` | `/dustbins[/:id]` | admin |
| `GET`  `POST` `DELETE` | `/users[/:id]` | admin |
| `POST` | `/users/:id/reset-password` | admin |
| `GET`  | `/alerts` | bearer |
| `POST` | `/alerts/:id/ack` | bearer |
| `GET`  | `/audit` | admin |
| `GET`  | `/config/public` | bearer |
| `GET`  `PUT` | `/config` | admin |
| `GET`  `POST` `PUT` `DELETE` | `/rules[/:id]` | admin |
| `POST` | `/ingest` | admin (manual / test) |
| `GET`  | `/health` · `/health/ready` | public |
| `WS`   | `/ws?token=&topics=` | bearer |

---

## 🛡 Security highlights

- HTTPS termination + HSTS, X-Frame-Options, Referrer-Policy, Permissions-Policy via nginx.
- `@fastify/helmet`, CORS allow-list, `@fastify/rate-limit` (default 600 req / IP / min).
- Zod schemas validate every body and query.
- Bcrypt cost-12 password hashing.
- JWT access (15 m) + rotating refresh (7 d) — only the **hash** of the active refresh token is stored server-side.
- Optional AES-256-GCM payload encryption for sensitive POST bodies (e.g. login).
- Surveillance iframes are sandboxed (`allow-same-origin allow-scripts allow-presentation`).
- Audit logs capture every privileged mutation (actor, IP, UA, diff).

---

## 📈 Scalability

- **MongoDB**: time-series collection for sensor archive; bounded arrays on
  the hot `Dustbin` doc for dashboard reads; secondary indexes on
  `dustbinId`, `tenantId`, geospatial coords, alert acknowledgement.
- **Stateless API**: refresh token state is the *only* server-side login
  state — horizontally scale Fastify behind nginx / k8s HPA.
- **Multi-tenant ready**: every collection carries `tenantId` (default
  `default`) so one cluster can serve many cities.
- **Realtime fan-out**: in-process WS hub today; swap to Redis pub/sub by
  flipping `REDIS_ENABLED=true` and dropping a few lines into `ws.service.ts`
  to broadcast across replicas.
- **Offline / store-and-forward**: ingestion path is idempotent — devices
  may batch and re-publish on reconnect.

---

## 🧪 Default account warning

The seeder creates `admin/admin` and `user/user` so you can log in immediately.
**Rotate them on first login** via the Admin → Users page (or simply delete
the seeder and create your own user).

---

## License

MIT © 2026 Rahul Singh — see [LICENSE](LICENSE).
