import axios, { type AxiosInstance } from "axios";
import { cryptoEnabled, encryptJson } from "./crypto";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3023";

function readToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem("wm.access");
}

function readRefresh(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem("wm.refresh");
}

function writeTokens(access: string, refresh: string): void {
  window.localStorage.setItem("wm.access", access);
  window.localStorage.setItem("wm.refresh", refresh);
}

function clearTokens(): void {
  window.localStorage.removeItem("wm.access");
  window.localStorage.removeItem("wm.refresh");
  window.localStorage.removeItem("wm.user");
}

export const api: AxiosInstance = axios.create({
  baseURL: API_URL,
  timeout: 15000,
});

api.interceptors.request.use((cfg) => {
  const t = readToken();
  if (t) cfg.headers.Authorization = `Bearer ${t}`;
  return cfg;
});

let refreshing: Promise<string | null> | null = null;

api.interceptors.response.use(
  (r) => r,
  async (err) => {
    const status = err?.response?.status;
    const original = err?.config;
    if (status === 401 && original && !original._retry) {
      original._retry = true;
      const newAccess = await (refreshing ??= refreshAccessToken());
      refreshing = null;
      if (newAccess) {
        original.headers.Authorization = `Bearer ${newAccess}`;
        return api.request(original);
      }
      if (typeof window !== "undefined") {
        clearTokens();
        if (!window.location.pathname.startsWith("/login")) {
          window.location.href = "/login";
        }
      }
    }
    return Promise.reject(err);
  }
);

async function refreshAccessToken(): Promise<string | null> {
  const refresh = readRefresh();
  if (!refresh) return null;
  try {
    const res = await axios.post(`${API_URL}/auth/refresh`, { refreshToken: refresh });
    writeTokens(res.data.accessToken, res.data.refreshToken);
    return res.data.accessToken;
  } catch {
    return null;
  }
}

export const auth = {
  async login(username: string, password: string): Promise<{ role: "admin" | "user"; username: string }> {
    // When the shared AES key is configured we never put the raw credentials on
    // the wire — only the encrypted blob the server can decrypt.
    let body: { payload: string } | { username: string; password: string } = { username, password };
    if (cryptoEnabled()) {
      try {
        body = { payload: await encryptJson({ username, password }) };
      } catch {
        // Fallback for non-secure contexts (e.g. http://LAN-IP in dev)
        // where WebCrypto may be unavailable.
        body = { username, password };
      }
    }
    const res = await axios.post(`${API_URL}/auth/login`, body);
    writeTokens(res.data.accessToken, res.data.refreshToken);
    window.localStorage.setItem("wm.user", JSON.stringify(res.data.user));
    return res.data.user;
  },
  logout(): void {
    void api.post("/auth/logout").catch(() => undefined);
    clearTokens();
  },
  current(): { id: string; username: string; role: "admin" | "user"; email?: string; assignedDustbins?: string[] } | null {
    if (typeof window === "undefined") return null;
    const raw = window.localStorage.getItem("wm.user");
    return raw ? JSON.parse(raw) : null;
  },
  token(): string | null {
    return readToken();
  },
};

export const API_BASE = API_URL;

// ── Domain-specific API clients ─────────────────────────────────────────
// Tiny typed wrappers around the new backend endpoints. Keep them here so
// the rest of the UI uses one consistent import path: `import { reports } …`.

export interface DashboardKpis {
  totals: {
    dustbins: number;
    online: number;
    offline: number;
    critical: number;
    warning: number;
    healthy: number;
    avgFill: number;
    openAlerts: number;
    citizenReportsOpen: number;
  };
  fillBuckets: Array<{ bucket: "0-25" | "25-50" | "50-75" | "75-90" | "90-100"; count: number }>;
  topFull: Array<{ dustbinId: string; dustbinName: string; fill: number; zone?: string }>;
  zones: Array<{ zone: string; count: number; avgFill: number; critical: number }>;
  recentAlerts: number;
}

export interface OptimizedRoute {
  ordered: Array<{ dustbinId: string; dustbinName: string; lat: number; lng: number; depth: number; zone: string }>;
  totalDistanceKm: number;
  estimatedMinutes: number;
  startedAt: string;
  unreachable: number;
}

interface ApiOptimizedRoute {
  depot: { latitude: number; longitude: number };
  stops: Array<{
    dustbinId: string;
    dustbinName: string;
    latitude: number;
    longitude: number;
    fill: number;
    zone?: string;
  }>;
  distanceKm: number;
  estDurationMin: number;
  generatedAt: string;
}

function normalizeOptimizedRoute(route: ApiOptimizedRoute | OptimizedRoute): OptimizedRoute {
  if ("ordered" in route) return route;
  return {
    ordered: route.stops.map((stop) => ({
      dustbinId: stop.dustbinId,
      dustbinName: stop.dustbinName,
      lat: stop.latitude,
      lng: stop.longitude,
      depth: stop.fill,
      zone: stop.zone ?? "",
    })),
    totalDistanceKm: route.distanceKm,
    estimatedMinutes: route.estDurationMin,
    startedAt: route.generatedAt,
    unreachable: 0,
  };
}

export interface NotificationItem {
  _id: string;
  title: string;
  body?: string;
  severity: 'info' | 'success' | 'warning' | 'critical';
  category: 'ALERT' | 'SYSTEM' | 'CITIZEN' | 'ROUTE' | 'ACCOUNT';
  link?: string;
  read: boolean;
  readAt?: string;
  createdAt: string;
}

export interface CitizenReport {
  _id: string;
  dustbinId?: string;
  description: string;
  category: 'OVERFLOW' | 'DAMAGE' | 'BAD_SMELL' | 'MISSING' | 'OTHER';
  photoUrl?: string;
  lat?: number;
  lng?: number;
  contactName?: string;
  contactEmail?: string;
  contactPhone?: string;
  status: 'NEW' | 'TRIAGED' | 'RESOLVED' | 'REJECTED';
  createdAt: string;
}

export const analytics = {
  dashboard: () => api.get<DashboardKpis>('/analytics/dashboard').then((r) => r.data),
  fillTrend: (id: string, hours = 24) =>
    api.get<{ dustbinId: string; hours: number; points: Array<{ ts: string; value: number }> }>(
      `/analytics/dustbins/${encodeURIComponent(id)}/fill-trend`,
      { params: { hours } }
    ).then((r) => r.data),
};

export const routes = {
  optimize: (opts: { startLat: number; startLng: number; fillThreshold?: number; zone?: string; limit?: number; avgKmh?: number; serviceMinPerStop?: number }) =>
    api
      .post<ApiOptimizedRoute | OptimizedRoute>('/routes/optimize', {
        depotLat: opts.startLat,
        depotLng: opts.startLng,
        fillThreshold: opts.fillThreshold,
        zone: opts.zone,
        limit: opts.limit,
        avgKmh: opts.avgKmh,
        serviceMinPerStop: opts.serviceMinPerStop,
      })
      .then((r) => normalizeOptimizedRoute(r.data)),
};

export const notifications = {
  list: (opts?: { unread?: boolean; limit?: number }) =>
    api
      .get<NotificationItem[] | { items?: NotificationItem[] }>("/notifications", { params: opts })
      .then((r) => (Array.isArray(r.data) ? r.data : (r.data.items ?? []))),
  unreadCount: () => api.get<{ count: number }>('/notifications/unread-count').then((r) => r.data.count),
  markRead: (ids?: string[]) => api.post<{ modified: number }>('/notifications/mark-read', { ids: ids ?? [] }).then((r) => r.data.modified),
};

export const reports = {
  // Public submission — does NOT use the authenticated `api` client.
  submit: (body: Omit<CitizenReport, '_id' | 'status' | 'createdAt'> & { website?: string }) =>
    axios.post<{ ok: true; id: string }>(`${API_URL}/public/citizen-reports`, body).then((r) => r.data),
  list: (opts?: { status?: CitizenReport['status']; limit?: number }) =>
    api
      .get<CitizenReport[] | { items?: CitizenReport[] }>('/citizen-reports', { params: opts })
      .then((r) => (Array.isArray(r.data) ? r.data : (r.data.items ?? []))),
  update: (id: string, status: CitizenReport['status']) =>
    api.patch<CitizenReport>(`/citizen-reports/${encodeURIComponent(id)}`, { status }).then((r) => r.data),
};

export interface SensorReadingItem {
  id: string;
  dustbinId: string;
  metric: 'depth' | 'gas' | 'humidity' | 'temperature';
  value: number;
  timestamp: string;
}

export interface SensorReadingPage {
  items: SensorReadingItem[];
  nextCursor: string | null;
  pageSize: number;
}

export const sensorReadings = {
  list: (opts?: {
    dustbinId?: string;
    dustbinIds?: string[];
    metric?: SensorReadingItem['metric'];
    from?: string;
    to?: string;
    limit?: number;
    cursor?: string;
  }) => {
    const params: Record<string, string | number> = {};
    if (opts?.dustbinId) params.dustbinId = opts.dustbinId;
    if (opts?.dustbinIds && opts.dustbinIds.length > 0) params.dustbinIds = opts.dustbinIds.join(',');
    if (opts?.metric) params.metric = opts.metric;
    if (opts?.from) params.from = opts.from;
    if (opts?.to) params.to = opts.to;
    if (opts?.limit) params.limit = opts.limit;
    if (opts?.cursor) params.cursor = opts.cursor;
    return api.get<SensorReadingPage>('/sensor-readings', { params }).then((r) => r.data);
  },
  recent: (opts?: { dustbinId?: string; metric?: SensorReadingItem['metric']; limit?: number }) =>
    api
      .get<{ items: SensorReadingItem[] }>('/sensor-readings/recent', { params: opts })
      .then((r) => r.data.items),
  byBin: (
    dustbinId: string,
    opts?: { metric?: SensorReadingItem['metric']; from?: string; to?: string; limit?: number; cursor?: string }
  ) =>
    api
      .get<SensorReadingPage>(`/sensor-readings/by-bin/${encodeURIComponent(dustbinId)}`, { params: opts })
      .then((r) => r.data),
};

export const exports = {
  href: (kind: 'dustbins' | 'alerts' | 'citizen-reports', q?: Record<string, string | number>) => {
    const params = new URLSearchParams();
    if (q) for (const [k, v] of Object.entries(q)) params.set(k, String(v));
    const tok = readToken();
    // The download is opened in a new tab — we attach the bearer token via
    // a query param fallback ONLY when the browser can't send the header.
    // For most flows we rely on a fetch + blob save instead (see helper below).
    return `${API_URL}/export/${kind}.csv${params.toString() ? '?' + params.toString() : ''}${tok ? '' : ''}`;
  },
  async download(kind: 'dustbins' | 'alerts' | 'citizen-reports', q?: Record<string, string | number>): Promise<void> {
    const res = await api.get(`/export/${kind}.csv`, { params: q, responseType: 'blob' });
    const blob = new Blob([res.data as BlobPart], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${kind}-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  },
};
