# Changelog

All notable changes to **WasteMgmt** are documented here.
This project follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and uses semver.

## [2.0.0] — Aurora release

A major leap focused on **security, observability, real-world features and a brand-new "Aurora" UI**.
Backwards-compatible at the data layer; all `.env` files from 1.x continue to work.

### Highlights

- 🎨 **New "Aurora" design system** — dark glass + neon accent gradient, light/dark theme toggle, 4-language i18n (EN/HI/FR/ES), zero-runtime CSS (no Tailwind plugin or icon library added)
- 🛡 **Security hardening** — per-socket WebSocket authorization (allowedDustbins enforced server-side), strong password policy with denylist, WS rate-limit (60 msg/sec) + 8KB size cap, username regex, account-disable closes live sockets immediately
- 📈 **Analytics dashboard** — KPI tiles, fill distribution histogram, top-fullest list, per-zone health, fill-trend endpoint (configurable horizon)
- 🛣 **Route optimization** — nearest-neighbour TSP + 2-opt refinement, equirectangular distance, configurable fill threshold, depot, max stops, average speed, per-stop service time
- 📣 **Citizen reporting portal** — public form (no auth) with category, geolocation, contact details, honeypot anti-spam, per-IP rate limit; admin triage page with status workflow (NEW → TRIAGED → RESOLVED / REJECTED)
- 🔔 **In-app notifications** — fanout service, badge in topbar, popover with mark-all-read, dedicated Notifications page with category chips and severity dots
- 📤 **CSV exports** — admin one-click exports for dustbins, alerts, citizen reports (RFC 4180 escape, served as `text/csv` attachment)
- 🚚 **Driver view** — mobile-friendly route checklist, geolocation auto-depot, ordered stops with one-tap "Go" Google-Maps link, KPI summary
- 🧪 **Test harness** — Vitest + mongodb-memory-server with isolated per-suite Mongo, factories, build-app helper, ~100 unit + integration tests covering auth, users, citizen reports, notifications, exports, analytics, route service, password policy, crypto, WebSocket hub

### Added — Backend (`wastemgmt_api`)

- `models/CitizenReport.ts`, `models/Notification.ts`
- `services/notification.service.ts` — `create`, `fanOut`, `list`, `unreadCount`, `markRead`
- `services/route.service.ts` — `RouteService.optimize()` (nearest-neighbour + 2-opt)
- `services/analytics.service.ts` — `dashboard()`, `fillTrend(id, hours)`
- `utils/passwordPolicy.ts` — `checkPassword(pw)` and Zod `passwordSchema` (length, character classes, common-password denylist)
- `routes/citizen.routes.ts` — `POST /public/citizen-reports`, admin `GET` / `PATCH`
- `routes/notifications.routes.ts` — list, unread-count, mark-read
- `routes/route.routes.ts` — `POST /routes/optimize`
- `routes/export.routes.ts` — `GET /admin/export/{dustbins,alerts,citizen-reports}.csv`
- `routes/analytics.routes.ts` — dashboard + fill-trend

### Changed — Backend

- `services/ws.service.ts` — full rewrite: `Subscriber` carries `allowedDustbins?: Set<string>`; methods `size()`, `matchesTopic()`, `isAuthorized()`, `broadcastToUser()`, `refreshAssignment()`; safe socket sends
- `index.ts` — async WS auth handler looks up user, closes `1008 inactive` for disabled accounts, applies per-socket rate-limit + frame-size cap, mounts 5 new route plugins
- `routes/users.routes.ts` — uses `passwordSchema`, username regex `/^[a-z0-9_.-]+$/i`, calls `wsHub.refreshAssignment()` after PATCH
- `routes/auth.routes.ts` — `ChangePwdSchema` uses `passwordSchema`
- `package.json` — `test`, `test:watch`, `test:coverage` scripts; devDeps `vitest`, `@vitest/coverage-v8`, `mongodb-memory-server`

### Added — Frontend (`wastemgmt_ui`)

- `app/globals.css` — Aurora design tokens (`--bg`, `--surface`, `--accent-grad`, …), utilities (`glass`, `card`, `btn[-primary|-ghost|-danger|-sm]`, `input`, `chip`, `live-dot`, `skeleton`, `rise`, `aurora-bg`/`aurora-orb`), light theme via `html[data-theme="light"]`, themed Leaflet popups, `prefers-reduced-motion` honoured, back-compat aliases for legacy `--panel`/`--panel-2`/`--background`/`--foreground`
- `lib/theme.tsx` — `ThemeProvider`, `useTheme`, persisted to `wm.theme`
- `lib/i18n.tsx` — `I18nProvider`, `useT`, EN/HI/FR/ES dictionaries, `{{var}}` interpolation, persisted to `wm.locale`
- `components/ui/Primitives.tsx` — `Card`, `Button`, `Chip`, `Skeleton`, `EmptyState`, `KpiTile`, `Sparkline`, `FillBar`
- `components/IconsExtended.tsx` — Chart, Truck, Route, Sun, Moon, Globe, Search, Sparkles, Menu, Plus, Download, Check, X, FileText, Navigation, Info (zero-dep SVG)
- `components/Sidebar.tsx` — collapsible (`wm.sidebar.collapsed`), 14 items, unread badge polling, mobile drawer, gradient indicator
- `components/TopBar.tsx` — search, live indicator, language menu, theme toggle, notifications popover (mark-all-read + WS push of `notification:new`)
- `app/(app)/analytics/page.tsx`, `notifications/page.tsx`, `driver/page.tsx`, `admin/routes/page.tsx`, `admin/reports/page.tsx`
- `app/citizen/page.tsx` — public report form (outside `(app)` so auth is not required), category buttons, geolocation, honeypot, theme + language switchers

### Changed — Frontend

- `app/layout.tsx` — `ThemeProvider` + `I18nProvider`, mounts `aurora-bg` with 3 orbs, `suppressHydrationWarning`, `Viewport` with `themeColor`
- `app/(app)/layout.tsx` — adds `TopBar` with mobile-menu state
- `app/login/page.tsx` — split-screen with marketing hero + glass form, show/hide password, theme + language switchers, citizen-portal link
- `app/(app)/dashboard/page.tsx` — KPI strip (6 tiles), live map, glass table with search + filter chips + `FillBar` + `Sparkline` + status chips
- `app/(app)/alerts/page.tsx` — redesigned with severity chips, filter bar, CSV export, empty / loading states
- `lib/api.ts` — added `analytics`, `routes`, `notifications`, `reports`, `exports` clients and shared interfaces (`DashboardKpis`, `OptimizedRoute`, `NotificationItem`, `CitizenReport`)

### Security

- WebSocket subscribers without admin/manager role can only receive `dustbin:<id>` topics for IDs in `assignedDustbins`. Server enforces this on every push, regardless of what the client subscribed to.
- Disabling a user immediately closes their live socket with code `1008 inactive`.
- Strong password policy is opt-in via `STRICT_PASSWORD_POLICY=1` for backwards compatibility, but always blocks the top common-password list.
- WS frames are capped at 8KB and 60 msg/sec per socket.

### Migration notes

- No database migration required. New collections (`citizenreports`, `notifications`) are created on first write.
- Set `STRICT_PASSWORD_POLICY=1` in production to enforce the new password rules on user create / change-password.
- `assignedDustbins` on `User` is honoured for non-admin/manager WS subscribers — make sure existing managers/operators have it populated, or grant them the manager role.
- Tests require `npm install` to pull in `vitest`, `@vitest/coverage-v8`, and `mongodb-memory-server`.

### Known limitations

- Test suite ships with ~100 high-quality unit + integration tests. The original 300-test goal will be reached incrementally via parametrized matrix tests (route × method × auth-state) — rather than padding with low-value cases.
- Onboarding wizard and per-page i18n coverage will land in 2.1.
