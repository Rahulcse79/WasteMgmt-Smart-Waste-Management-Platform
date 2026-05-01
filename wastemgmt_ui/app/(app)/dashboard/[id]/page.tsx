"use client";
import dynamic from "next/dynamic";
import { use, useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useLiveSocket } from "@/lib/socket";
import type { Dustbin } from "@/lib/types";
import { latestOf } from "@/lib/types";
import { StatCard } from "@/components/StatCard";
import { SensorChart } from "@/components/SensorChart";
import { DustbinModel } from "@/components/DustbinModel";

const MapView = dynamic(() => import("@/components/MapView").then((m) => m.MapView), {
  ssr: false,
  loading: () => <div className="h-[460px] rounded-xl bg-[var(--panel)] animate-pulse" />,
});

interface PageProps {
  params: Promise<{ id: string }>;
}

export default function DustbinDetailPage({ params }: PageProps): React.ReactElement {
  const { id } = use(params);
  const [d, setD] = useState<Dustbin | null>(null);
  const [eta, setEta] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const [doc, pred] = await Promise.all([
        api.get<Dustbin>(`/dustbins/${encodeURIComponent(id)}`),
        api.get<{ etaIso: string | null }>(`/dustbins/${encodeURIComponent(id)}/predict`).catch(() => ({ data: { etaIso: null } })),
      ]);
      setD(doc.data);
      setEta(pred.data.etaIso);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { void load(); }, [load]);

  useLiveSocket([`dustbin:${id}`], (e) => {
    if (e.event !== "reading") return;
    const p = e.payload as {
      dustbinId: string;
      timestamp: string;
      metrics: Partial<Record<"depth" | "gas" | "humidity" | "temperature", number>>;
    };
    setD((prev) => {
      if (!prev) return prev;
      const next: Dustbin = { ...prev, latest: { ...(prev.latest ?? {}), timestamp: p.timestamp, ...p.metrics } };
      for (const k of ["depth", "gas", "humidity", "temperature"] as const) {
        const v = p.metrics[k];
        if (typeof v === "number") {
          next[k] = [...(prev[k] ?? []), { value: v, timestamp: p.timestamp }].slice(-200);
        }
      }
      return next;
    });
  });

  if (loading) return <div className="p-6 font-dm-sans" style={{ color: "var(--color-text-secondary)" }}>Loading…</div>;
  if (!d) return <div className="p-6 font-dm-sans" style={{ color: "var(--danger)" }}>Dustbin not found.</div>;

  const depth = latestOf(d.depth, d.latest?.depth);
  const gas   = latestOf(d.gas,   d.latest?.gas);
  const hum   = latestOf(d.humidity,    d.latest?.humidity);
  const temp  = latestOf(d.temperature, d.latest?.temperature);

  return (
    <div className="p-4 space-y-6">
      {/* ── KPI Cards ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard label="Dustbin Level"  value={depth != null ? depth  : "—"} unit="%" tone="cyan"    icon={<span>📦</span>} />
        <StatCard label="Gas Level"      value={gas   != null ? gas    : "—"} unit="ppm" tone="rose"  icon={<span>⏱️</span>} />
        <StatCard label="Humidity"       value={hum   != null ? hum    : "—"} unit="%" tone="amber"   icon={<span>💧</span>} />
        <StatCard label="Temperature"    value={temp  != null ? temp   : "—"} unit="°C" tone="emerald" icon={<span>🌡️</span>} />
      </div>

      {/* ── Prediction banner ── */}
      {eta ? (
        <div
          className="rounded-xl px-4 py-3 text-sm font-dm-sans"
          style={{
            background: "rgba(0,201,167,0.08)",
            border: "1px solid rgba(0,201,167,0.3)",
            color: "#6ee7b7",
          }}
        >
          🤖 Predicted bin-full:{" "}
          <strong className="font-syne">{new Date(eta).toLocaleString()}</strong>
        </div>
      ) : null}

      {/* ── Main content: 3D Dustbin + Charts ── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* 3D Dustbin model — spans 3 cols */}
        <div
          className="lg:col-span-3 rounded-2xl border flex flex-col items-center justify-center py-6"
          style={{
            background: "var(--surface)",
            borderColor: "var(--border)",
            backdropFilter: "blur(14px)",
          }}
        >
          <h3
            className="font-syne font-semibold text-sm mb-2"
            style={{ color: "var(--color-text-primary)" }}
          >
            Bin 3D View
          </h3>
          <DustbinModel fillPercent={depth ?? 0} binId={d.dustbinName} />
        </div>

        {/* Temperature area chart — 4 cols */}
        <div className="lg:col-span-4">
          <SensorChart
            title="Temperature (°C)"
            data={d.temperature ?? []}
            color="#f87171"
            unit="°C"
            variant="area"
          />
        </div>

        {/* Humidity gauge — 2 cols */}
        <div className="lg:col-span-2">
          <SensorChart
            title="Humidity (%)"
            data={d.humidity ?? []}
            color="#22d3ee"
            unit="%"
            variant="gauge"
          />
        </div>

        {/* Gas threshold line chart — 3 cols */}
        <div className="lg:col-span-3">
          <SensorChart
            title="Gas (ppm)"
            data={d.gas ?? []}
            color="#f472b6"
            unit="ppm"
            variant="threshold"
            dangerThreshold={500}
          />
        </div>

        {/* Depth stacked bar — full row */}
        <div className="lg:col-span-12">
          <SensorChart
            title="Depth (%)"
            data={d.depth ?? []}
            color="#34d399"
            unit="%"
            variant="bar"
          />
        </div>
      </div>

      {/* ── Location map ── */}
      <section
        className="rounded-2xl border p-3"
        style={{ background: "var(--surface)", borderColor: "var(--border)" }}
      >
        <h2
          className="text-center font-syne font-semibold py-3"
          style={{ color: "var(--color-text-primary)" }}
        >
          Location of {d.dustbinName}
        </h2>
        <MapView dustbins={[d]} height={460} center={[d.latitude, d.longitude]} />
      </section>
    </div>
  );
}

