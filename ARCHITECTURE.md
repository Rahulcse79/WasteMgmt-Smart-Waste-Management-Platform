# Architecture — Smart Waste Management Platform

## 1. High-level diagram

```
   ┌──────────────────────┐         MQTTS (TLS, mTLS)
   │  IoT Dustbins (N)    │ ───────────────────────────────┐
   │  (sensors, oneM2M)   │                                 │
   └──────────────────────┘                                 ▼
                                              ┌────────────────────────┐
                                              │  Mosquitto / CCSP MQTT │
                                              │  ccsp.m2m.minfoway.com │
                                              └────────────┬───────────┘
                                                           │  /oneM2M/resp/#
                       ┌─────────────────────────────────────────────────┐
                       │                Fastify API (Node 20)            │
                       │  ┌──────────┐  ┌──────────┐  ┌───────────────┐  │
                       │  │ MqttSvc  │→ │ DustbinSvc│ │ RulesSvc      │  │
                       │  │ (TLS)    │  │ (write)   │ │ + AlertSvc    │  │
                       │  └──────────┘  └──────────┘  └──────┬────────┘  │
                       │  ┌──────────┐  ┌──────────┐         │           │
                       │  │ AuthSvc  │  │ wsHub    │←────────┘           │
                       │  │ JWT/RBAC │  │  WS /ws  │                     │
                       │  └──────────┘  └──────────┘                     │
                       │  ┌──────────┐  ┌──────────┐  ┌───────────────┐  │
                       │  │ Audit    │  │ Email    │  │ Heartbeat     │  │
                       │  │ Log      │  │ (SMTP)   │  │ (cron 60s)    │  │
                       │  └──────────┘  └──────────┘  └───────────────┘  │
                       └──────────┬──────────────────────┬───────────────┘
                                  │                      │
                                  │ Mongoose             │ wss://…/ws
                                  ▼                      ▼
                       ┌──────────────────┐    ┌──────────────────────┐
                       │ MongoDB Atlas    │    │  Next.js 16 UI       │
                       │  - users         │    │  (React 19, Tailwind │
                       │  - dustbins      │    │   v4, Leaflet,       │
                       │  - alerts        │    │   Recharts)          │
                       │  - audit         │    │                      │
                       │  - rules         │    │  /dashboard          │
                       │  - configs       │    │  /dashboard/[id]     │
                       │  - sensorreadings│    │  /surveillance       │
                       │    (time-series) │    │  /alerts /admin/*    │
                       └──────────────────┘    └──────────────────────┘
                                  ▲                      ▲
                                  │                      │   HTTPS
                                  └─── nginx (TLS, HSTS, WS proxy) ──── Internet
```

## 2. Data model

### `users`
| Field | Type | Notes |
|---|---|---|
| `username` | String | unique, lowercased, indexed |
| `passwordHash` | String | bcrypt cost-12 |
| `role` | enum(`admin`,`user`) | RBAC |
| `assignedDustbins` | [String] | scopes a `user`'s data view |
| `refreshTokenHash` | String | sha256 of active refresh |
| `lastLoginAt` | Date | audit / dashboards |

### `dustbins`
| Field | Notes |
|---|---|
| `dustbinId` | unique, indexed |
| `latitude`, `longitude` | indexed pair |
| `tenantId`, `zone` | multi-tenant scoping |
| `depth/gas/humidity/temperature` | bounded arrays (last 200) |
| `latest.{metric, timestamp}` | cached for cheap dashboard reads |
| `online`, `lastSeenAt` | maintained by ingest + heartbeat |

### `sensorreadings` *(MongoDB time-series)*
- `timeField: timestamp`, `metaField: dustbinId`, `granularity: minutes`.
- 90-day retention via `expireAfterSeconds`.
- Carries (`dustbinId`, `metric`, `value`, `timestamp`, `tenantId`).

### `alerts`, `auditlogs`, `rules`, `appconfigs`
See `wastemgmt_api/src/models/*.ts`.

### Indexing strategy
- Compound: `(tenantId, isActive)`, `(tenantId, zone)`, `(tenantId, acknowledged, createdAt)`.
- Time index implicit on time-series collection.
- All API hot paths read with `.lean()` to skip Mongoose hydration cost.

## 3. Auth flow

```
POST /auth/login            { username, password }   →  { accessToken, refreshToken, user }
   │
   ├── verify bcrypt
   ├── sign access (15m, JWT_ACCESS_SECRET)
   ├── sign refresh (7d, JWT_REFRESH_SECRET) — store SHA256(refresh)
   └── audit LOGIN_SUCCESS / LOGIN_FAILED

POST /auth/refresh          { refreshToken }
   ├── verify with refresh secret
   ├── compare SHA256 hash (rotation: any older refresh becomes invalid)
   └── issue new pair, replace stored hash

POST /auth/logout (bearer)  → clears refresh hash
```

For sensitive callers, the same login endpoint accepts `payload`
(AES-256-GCM token of `{username,password}`) using `PAYLOAD_ENC_KEY`.

## 4. WebSocket protocol

Connect: `wss://host/ws?token=<accessToken>&topics=dustbin:*,alerts`

Server → client message:

```json
{ "topic": "dustbin:RGGP-01", "event": "reading",
  "payload": { "dustbinId": "RGGP-01", "timestamp": "...", "metrics": { "depth": 12.7 } },
  "ts": 1730000000000 }
```

Client may send: `{"action":"subscribe","topics":["dustbin:RGGP-02"]}`.

## 5. Scaling

| Concern | Strategy |
|---|---|
| **Stateless API** | JWT only; refresh hash in DB. Run behind nginx + HPA (`infra/k8s/api-deployment.yaml`). |
| **Hot reads** | `Dustbin.latest.*` cached snapshot avoids scanning history arrays. Cap rolling window at 200 entries. |
| **Long-term store** | Time-series collection partitions and compresses by `dustbinId`. Auto-expire via TTL. |
| **MQTT throughput** | One subscriber process is fine to ~10k msg/s — when scaling beyond, deploy N instances behind a shared MQTT consumer group (e.g. EMQX shared subscriptions `$share/wm/topic`). |
| **WS fan-out** | In-process today. For multi-replica deployments enable Redis pub/sub: publish from `wsHub.broadcast` to a Redis channel and subscribe per pod. |
| **MongoDB sharding** | Shard key candidates: `tenantId` (range) for the `Dustbin` collection, `{dustbinId:hashed}` for `sensorreadings`. |
| **Caching** | Redis layer wired in compose; suitable for `/dustbins` list cache + per-IP rate limits. |
| **Multi-tenant** | Every doc carries `tenantId`. Add a Fastify hook to inject `tenantId` from JWT claim if you scale beyond one city. |

## 6. Security implementation

- **TLS everywhere** (nginx terminating, MQTT mTLS to broker).
- **`@fastify/helmet`** sets X-Content-Type-Options, X-Download-Options, Origin-Agent-Cluster, etc.
- **CORS allow-list** in `wastemgmt_api/src/index.ts` (`config.corsOrigins`).
- **Rate limiting** via `@fastify/rate-limit` (Redis-backed if `REDIS_ENABLED=true`).
- **Validation** with Zod on every route body and query.
- **Bcrypt cost 12** + JWT-only sessions + refresh rotation.
- **AES-256-GCM** payload encryption (auth tag verified) for opt-in encrypted bodies.
- **Audit log** of every admin mutation (`AuditService.log`).
- **Surveillance iframes** sandboxed and `referrerPolicy="no-referrer"`.
- **CSP / X-Frame-Options / HSTS** at the nginx layer (`infra/docker/nginx.conf`).

## 7. Folder structure (deep)

```
wastemgmt_api/
  src/
    index.ts                 Bootstrap, plugins, WS handler, graceful shutdown
    config.ts                Zod-validated env loader
    db.ts logger.ts          Mongo connect + pino
    seed.ts                  Idempotent admin/user seeder
    models/                  User, Dustbin, SensorReading, Alert, AuditLog, AppConfig, Rule
    middleware/              auth (JWT + RBAC), validate (Zod)
    services/                auth, dustbin, alert, audit, rules, prediction, mqtt, ws, email, heartbeat
    routes/                  auth, dustbins, users, alerts, audit, config, rules, health, ingest
    utils/                   crypto (AES-GCM), password (bcrypt)
  Dockerfile  .env.example  package.json  tsconfig.json

wastemgmt_ui/
  app/
    layout.tsx page.tsx login/page.tsx
    (app)/                   Authenticated shell (Sidebar layout)
      layout.tsx             Client-side auth gate
      dashboard/page.tsx     Live table + map (matches screenshot)
      dashboard/[id]/page.tsx Detail: stat cards + 4 charts + map
      surveillance/page.tsx  Camera iframes
      alerts/page.tsx        Alerts inbox + ack
      admin/
        dustbins/page.tsx    CRUD
        users/page.tsx       Create + reset password
        rules/page.tsx       Threshold rule editor
        audit/page.tsx       Audit explorer
        settings/page.tsx    MQTT URL, camera URLs, alert email
  components/                Sidebar, MapView (Leaflet), SensorChart (Recharts), StatCard, Icons
  lib/                       api (axios + token refresh), socket (live WS hook), types
  Dockerfile  next.config.ts globals.css

infra/
  docker/                    docker-compose.yml + hardened nginx.conf
  k8s/                       Deployment + HPA manifest
```
