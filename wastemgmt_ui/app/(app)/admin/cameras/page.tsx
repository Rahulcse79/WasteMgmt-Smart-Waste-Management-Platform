"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";

interface Camera {
  name: string;
  url: string;
  enabled: boolean;
}

interface PublicConfig {
  cameras: Camera[];
}

export default function AdminCamerasPage(): React.ReactElement {
  const [cameras, setCameras] = useState<Camera[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  async function load(): Promise<void> {
    setLoading(true);
    try {
      const r = await api.get<PublicConfig>("/config/public");
      const list = (r.data.cameras ?? []).map((c) => ({
        name: c.name ?? "",
        url: c.url ?? "",
        enabled: c.enabled !== false,
      }));
      setCameras(list);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  function add(): void {
    setCameras((prev) => [
      ...prev,
      { name: `Camera ${prev.length + 1}`, url: "", enabled: true },
    ]);
  }

  function remove(idx: number): void {
    setCameras((prev) => prev.filter((_, i) => i !== idx));
  }

  function update(idx: number, patch: Partial<Camera>): void {
    setCameras((prev) => prev.map((c, i) => (i === idx ? { ...c, ...patch } : c)));
  }

  async function save(): Promise<void> {
    setMsg(null);
    setSaving(true);
    try {
      const cleaned = cameras
        .map((c) => ({
          name: c.name.trim() || "Camera",
          url: c.url.trim(),
          enabled: c.enabled,
        }))
        .filter((c) => c.url.length > 0);
      await api.put("/config", {
        key: "cameras",
        value: cleaned,
        description: "Surveillance camera streams (admin-managed list)",
      });
      setMsg({ type: "ok", text: `Saved ${cleaned.length} camera stream(s).` });
      await load();
    } catch (err) {
      const x = err as { response?: { data?: { error?: string } } };
      setMsg({ type: "err", text: x?.response?.data?.error ?? "Save failed" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="p-6 space-y-6 max-w-4xl">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-white">Surveillance cameras</h1>
        <div className="flex gap-2">
          <button
            onClick={add}
            className="px-3 py-2 rounded bg-white/5 hover:bg-white/10 text-zinc-200 text-sm"
          >
            + Add camera
          </button>
          <button
            onClick={save}
            disabled={saving}
            className="px-4 py-2 rounded bg-cyan-500 hover:bg-cyan-400 text-black text-sm font-semibold disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save all"}
          </button>
        </div>
      </div>

      <p className="text-xs text-zinc-400">
        These streams will appear on the <span className="text-cyan-300">Surveillance</span> page
        for every signed-in user. Use any URL the browser can render in an iframe (HLS player page,
        MJPEG endpoint, hosted RTSP-to-WebRTC viewer, etc.).
      </p>

      {msg ? (
        <div
          className={`text-xs px-3 py-2 rounded ${
            msg.type === "ok"
              ? "bg-emerald-500/10 text-emerald-300 border border-emerald-500/30"
              : "bg-rose-500/10 text-rose-300 border border-rose-500/30"
          }`}
        >
          {msg.text}
        </div>
      ) : null}

      <div className="space-y-3">
        {loading ? (
          <div className="text-sm text-zinc-500">Loading…</div>
        ) : cameras.length === 0 ? (
          <div className="rounded-xl bg-[var(--panel)] border border-[var(--border)] p-8 text-center text-zinc-400 text-sm">
            No cameras yet. Click <span className="text-cyan-300">Add camera</span> to create one.
          </div>
        ) : (
          cameras.map((cam, idx) => (
            <div
              key={idx}
              className="rounded-xl bg-[var(--panel)] border border-[var(--border)] p-4 grid grid-cols-1 md:grid-cols-[200px_1fr_auto_auto] gap-3 items-center"
            >
              <input
                value={cam.name}
                onChange={(e) => update(idx, { name: e.target.value })}
                placeholder="Camera name"
                className="bg-[var(--panel-2)] border border-[var(--border)] rounded px-3 py-2 text-sm"
              />
              <input
                value={cam.url}
                onChange={(e) => update(idx, { url: e.target.value })}
                placeholder="https://surveillance.example.com/cam1"
                className="bg-[var(--panel-2)] border border-[var(--border)] rounded px-3 py-2 text-sm font-mono"
              />
              <label className="flex items-center gap-2 text-xs text-zinc-300 px-2">
                <input
                  type="checkbox"
                  checked={cam.enabled}
                  onChange={(e) => update(idx, { enabled: e.target.checked })}
                />
                Enabled
              </label>
              <button
                onClick={() => remove(idx)}
                className="px-3 py-2 text-xs text-rose-300 hover:text-rose-100 hover:bg-rose-500/10 rounded"
              >
                Remove
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
