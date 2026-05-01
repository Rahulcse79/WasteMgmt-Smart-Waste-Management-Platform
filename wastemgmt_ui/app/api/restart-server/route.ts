/**
 * POST /api/restart-server
 * Admin-only endpoint that restarts the wastemgmt_api backend process.
 *
 * Strategy (in order):
 *   1. pm2 restart wastemgmt-api           (if pm2 is available)
 *   2. kill process on API port (SIGTERM)  (tsx watch / nodemon will auto-restart)
 *
 * Authorization: Bearer <accessToken>  — must resolve to an admin user.
 */
import { NextRequest, NextResponse } from "next/server";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3023";
const API_PORT = (() => {
  try {
    return new URL(API_URL).port || "3023";
  } catch {
    return "3023";
  }
})();

async function verifyAdmin(token: string): Promise<boolean> {
  try {
    const r = await fetch(`${API_URL}/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!r.ok) return false;
    const body = await r.json() as { role?: string };
    return body.role === "admin";
  } catch {
    return false;
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  // ── Auth check ──
  const authHeader = req.headers.get("authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const isAdmin = await verifyAdmin(token);
  if (!isAdmin) {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }

  // ── Restart ──
  try {
    // Try pm2 first
    try {
      const { stdout } = await execAsync("pm2 restart wastemgmt-api 2>&1");
      return NextResponse.json({ ok: true, method: "pm2", output: stdout.trim() });
    } catch {
      // pm2 not available or process not registered — fall back to port kill
    }

    // Find process listening on the API port and send SIGTERM
    // tsx watch / nodemon will auto-restart the process
    const { stdout: pidOut } = await execAsync(`lsof -ti tcp:${API_PORT} 2>/dev/null || true`);
    const pids = pidOut.trim().split("\n").filter(Boolean);
    if (pids.length === 0) {
      return NextResponse.json({ error: `No process found on port ${API_PORT}` }, { status: 404 });
    }
    // Kill each PID gently (SIGTERM)
    for (const pid of pids) {
      await execAsync(`kill -TERM ${pid} 2>/dev/null || true`);
    }
    return NextResponse.json({ ok: true, method: "sigterm", pids });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Restart failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
