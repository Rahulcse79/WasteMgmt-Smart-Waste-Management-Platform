"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useRef } from "react";

interface ConfigEntry {
  _id: string;
  key: string;
  value: unknown;
  description?: string;
  updatedAt?: string;
}

interface CertFile {
  name: string;
  size: number;
  mtime: string;
}

const QUICK_KEYS = [
  { key: "mqtt.brokerUrl", label: "MQTT broker URL", placeholder: "mqtts://broker:8883" },
  { key: "mqtt.topic", label: "MQTT topic", placeholder: "/oneM2M/resp/#" },
  { key: "camera.stream1", label: "Camera 1 URL", placeholder: "https://surveillance.example.com/cam1" },
  { key: "camera.stream2", label: "Camera 2 URL", placeholder: "https://surveillance.example.com/cam2" },
  { key: "alerts.emailTo", label: "Alert email recipient", placeholder: "ops@example.com" },
];

/** Shared card style using CSS tokens — readable in both dark and light themes */
const cardCls = "rounded-xl border p-4 space-y-3";
const cardStyle = { background: "var(--surface)", borderColor: "var(--border)" };
const headingStyle = { color: "var(--color-text-primary)" };
const labelStyle = { color: "var(--color-text-secondary)", fontSize: "0.75rem" };
const mutedStyle = { color: "var(--fg-muted)", fontSize: "0.75rem" };

export default function AdminSettingsPage(): React.ReactElement {
  const [items, setItems] = useState<ConfigEntry[]>([]);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [savingKey, setSavingKey] = useState<string | null>(null);

  // ── HTTP/HTTPS protocol toggle ──
  const [protocol, setProtocol] = useState<"http" | "https">("https");
  const [savingProto, setSavingProto] = useState(false);
  const [protoMsg, setProtoMsg] = useState("");

  // ── Certificate upload ──
  const [certs, setCerts] = useState<CertFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadMsg, setUploadMsg] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  async function refresh(): Promise<void> {
    const r = await api.get<ConfigEntry[]>("/config");
    setItems(r.data);
    const map: Record<string, string> = {};
    for (const c of r.data) {
      map[c.key] = String(c.value ?? "");
      if (c.key === "server.protocol") setProtocol((c.value as string) === "http" ? "http" : "https");
    }
    setDraft((prev) => ({ ...map, ...prev }));
  }

  async function refreshCerts(): Promise<void> {
    try {
      const r = await fetch("/api/certs");
      if (r.ok) setCerts(await r.json() as CertFile[]);
    } catch { /* silent */ }
  }

  useEffect(() => {
    void refresh();
    void refreshCerts();
  }, []);

  async function save(key: string): Promise<void> {
    setSavingKey(key);
    try {
      await api.put("/config", { key, value: draft[key] });
      await refresh();
    } finally {
      setSavingKey(null);
    }
  }

  async function saveProtocol(): Promise<void> {
    setSavingProto(true);
    setProtoMsg("");
    try {
      await api.put("/config", { key: "server.protocol", value: protocol });
      setProtoMsg("Saved. Restart the API for changes to take effect.");
    } catch {
      setProtoMsg("Failed to save protocol setting.");
    } finally {
      setSavingProto(false);
    }
  }

  async function uploadCert(e: React.ChangeEvent<HTMLInputElement>): Promise<void> {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setUploading(true);
    setUploadMsg("");
    const fd = new FormData();
    for (const f of Array.from(files)) fd.append("files", f);
    try {
      const r = await fetch("/api/certs", { method: "POST", body: fd });
      const j = await r.json() as { uploaded?: string[]; error?: string };
      if (r.ok) {
        setUploadMsg(`Uploaded: ${(j.uploaded ?? []).join(", ")}`);
        await refreshCerts();
      } else {
        setUploadMsg(`Error: ${j.error ?? "Upload failed"}`);
      }
    } catch {
      setUploadMsg("Upload failed — server unreachable.");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <div className="p-6 space-y-6">
      <h1 className="font-syne text-xl font-bold" style={headingStyle}>System settings</h1>

      {/* ── Quick settings ── */}
      <section className={cardCls} style={cardStyle}>
        <h2 className="font-syne font-semibold text-sm pb-1" style={headingStyle}>Quick settings</h2>
        <div className="space-y-3">
          {QUICK_KEYS.map((q) => (
            <div key={q.key} className="grid grid-cols-1 md:grid-cols-[260px_1fr_auto] gap-2 items-center">
              <label className="font-dm-sans" style={labelStyle}>{q.label}</label>
              <input
                value={draft[q.key] ?? ""}
                placeholder={q.placeholder}
                onChange={(e) => setDraft({ ...draft, [q.key]: e.target.value })}
                className="input font-dm-sans text-sm"
              />
              <button
                onClick={() => save(q.key)}
                disabled={savingKey === q.key}
                className="btn-coral btn font-dm-sans text-xs px-4 py-2 disabled:opacity-50"
              >
                {savingKey === q.key ? "Saving…" : "Save"}
              </button>
            </div>
          ))}
        </div>
      </section>

      {/* ── Protocol toggle (HTTP / HTTPS) ── */}
      <section className={cardCls} style={cardStyle}>
        <h2 className="font-syne font-semibold text-sm pb-1" style={headingStyle}>Server protocol</h2>
        <p className="font-dm-sans text-xs" style={mutedStyle}>
          Choose whether the API server listens on HTTP or HTTPS. Restart the API after changing.
        </p>
        <div className="flex items-center gap-3 pt-1">
          {(["http", "https"] as const).map((p) => (
            <label key={p} className="flex items-center gap-2 cursor-pointer font-dm-sans text-sm" style={{ color: "var(--color-text-primary)" }}>
              <input
                type="radio"
                name="proto"
                value={p}
                checked={protocol === p}
                onChange={() => setProtocol(p)}
                className="accent-[#00C9A7]"
              />
              <span className="uppercase font-semibold tracking-wide">{p}</span>
            </label>
          ))}
          <button
            onClick={saveProtocol}
            disabled={savingProto}
            className="btn-coral btn font-dm-sans text-xs px-5 py-2 disabled:opacity-50 ml-4"
          >
            {savingProto ? "Saving…" : "Save"}
          </button>
          {protoMsg && (
            <span className="text-xs font-dm-sans" style={{ color: protoMsg.startsWith("F") ? "var(--danger)" : "var(--success)" }}>
              {protoMsg}
            </span>
          )}
        </div>
      </section>

      {/* ── TLS Certificate management ── */}
      <section className={cardCls} style={cardStyle}>
        <h2 className="font-syne font-semibold text-sm pb-1" style={headingStyle}>IoT / MQTT certificates</h2>
        <p className="font-dm-sans text-xs" style={mutedStyle}>
          Upload <code>.crt</code>, <code>.key</code> or <code>.pem</code> files to <code>/etc/iotmqttcerts/</code>. The folder is created automatically if it does not exist.
        </p>

        {/* File list */}
        {certs.length > 0 ? (
          <div className="rounded-lg overflow-hidden border" style={{ borderColor: "var(--border)" }}>
            <table className="w-full text-xs font-dm-sans">
              <thead>
                <tr style={{ background: "var(--surface-2)", color: "var(--fg-muted)" }}>
                  <th className="px-3 py-2 text-left uppercase tracking-wider">File</th>
                  <th className="px-3 py-2 text-left uppercase tracking-wider">Size</th>
                  <th className="px-3 py-2 text-left uppercase tracking-wider">Modified</th>
                </tr>
              </thead>
              <tbody className="divide-y" style={{ borderColor: "var(--border)" }}>
                {certs.map((c) => (
                  <tr key={c.name}>
                    <td className="px-3 py-2 font-mono" style={{ color: "var(--color-accent)" }}>{c.name}</td>
                    <td className="px-3 py-2" style={{ color: "var(--color-text-secondary)" }}>{(c.size / 1024).toFixed(1)} KB</td>
                    <td className="px-3 py-2" style={{ color: "var(--color-text-secondary)" }}>
                      {new Date(c.mtime).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-xs font-dm-sans py-2" style={mutedStyle}>No certificates found in /etc/iotmqttcerts/</p>
        )}

        {/* Upload area */}
        <div className="flex items-center gap-3 flex-wrap pt-1">
          <label
            className="btn font-dm-sans text-xs px-4 py-2 cursor-pointer"
            style={{ background: "var(--surface-2)", border: "1px dashed var(--border-strong)", color: "var(--color-text-primary)" }}
          >
            {uploading ? "Uploading…" : "Choose certificates…"}
            <input
              ref={fileRef}
              type="file"
              multiple
              accept=".crt,.key,.pem,.ca"
              className="hidden"
              disabled={uploading}
              onChange={uploadCert}
            />
          </label>
          {uploadMsg && (
            <span className="text-xs font-dm-sans" style={{ color: uploadMsg.startsWith("E") ? "var(--danger)" : "var(--success)" }}>
              {uploadMsg}
            </span>
          )}
        </div>
      </section>

      {/* ── All config entries ── */}
      <section className="rounded-xl border overflow-hidden" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
        <h2 className="px-4 py-3 font-syne font-semibold text-sm border-b" style={{ ...headingStyle, borderColor: "var(--border)" }}>
          All entries
        </h2>
        <table className="w-full text-sm font-dm-sans">
          <thead>
            <tr className="text-xs uppercase tracking-wider" style={{ color: "var(--fg-muted)" }}>
              <th className="px-4 py-2 text-left">Key</th>
              <th className="px-4 py-2 text-left">Value</th>
              <th className="px-4 py-2 text-left">Updated</th>
            </tr>
          </thead>
          <tbody className="divide-y" style={{ borderColor: "var(--border)" }}>
            {items.map((c) => (
              <tr key={c._id}>
                <td className="px-4 py-2 font-mono" style={{ color: "var(--color-accent)" }}>{c.key}</td>
                <td className="px-4 py-2 break-all" style={{ color: "var(--color-text-primary)" }}>{JSON.stringify(c.value)}</td>
                <td className="px-4 py-2" style={{ color: "var(--color-text-secondary)" }}>
                  {c.updatedAt ? new Date(c.updatedAt).toLocaleString() : "—"}
                </td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr>
                <td colSpan={3} className="text-center py-6" style={{ color: "var(--fg-muted)" }}>
                  No config entries yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}
