"use client";
import { useMemo } from "react";
import {
  AreaChart,
  Area,
  LineChart,
  Line,
  BarChart,
  Bar,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  ReferenceLine,
  Cell,
} from "recharts";
import type { Reading } from "@/lib/types";

interface Props {
  title: string;
  data: Reading[];
  color?: string;
  unit?: string;
  /** "area" (temperature/default) | "gauge" (humidity) | "threshold" (gas) | "bar" (depth) */
  variant?: "area" | "gauge" | "threshold" | "bar";
  /** ppm value above which to draw a red dashed alert line */
  dangerThreshold?: number;
}

/* ── Radial SVG gauge for Humidity ── */
function RadialGauge({ value, unit, color }: { value: number; unit: string; color: string }): React.ReactElement {
  const R = 60;
  const cx = 80, cy = 80;
  const startAngle = 210;
  const sweepAngle = 300;
  const clampedVal = Math.min(100, Math.max(0, value));
  const fillAngle = (clampedVal / 100) * sweepAngle;

  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const arcPath = (start: number, sweep: number) => {
    const s = toRad(start);
    const e = toRad(start + sweep);
    const x1 = cx + R * Math.cos(s);
    const y1 = cy + R * Math.sin(s);
    const x2 = cx + R * Math.cos(e);
    const y2 = cy + R * Math.sin(e);
    const large = sweep > 180 ? 1 : 0;
    return `M ${x1} ${y1} A ${R} ${R} 0 ${large} 1 ${x2} ${y2}`;
  };

  return (
    <div className="flex flex-col items-center justify-center h-full">
      <svg width="160" height="160" viewBox="0 0 160 160" aria-label={`${value} ${unit}`}>
        <defs>
          <linearGradient id="gaugeGrad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#22d3ee" />
            <stop offset="100%" stopColor={color} />
          </linearGradient>
        </defs>
        {/* Track */}
        <path d={arcPath(startAngle, sweepAngle)} fill="none" stroke="rgba(148,163,184,0.12)" strokeWidth="14" strokeLinecap="round" />
        {/* Fill */}
        {fillAngle > 0 && (
          <path d={arcPath(startAngle, fillAngle)} fill="none" stroke="url(#gaugeGrad)" strokeWidth="14" strokeLinecap="round"
            style={{ filter: `drop-shadow(0 0 6px ${color})` }} />
        )}
        <text x={cx} y={cy + 6} textAnchor="middle" fill="var(--color-text-primary)"
          fontSize="22" fontWeight="700" fontFamily="var(--font-syne)">
          {clampedVal.toFixed(0)}
        </text>
        <text x={cx} y={cy + 22} textAnchor="middle" fill="var(--color-text-secondary)" fontSize="12">
          {unit}
        </text>
      </svg>
    </div>
  );
}

/* ── Stacked bar for Depth (%) with color zones ── */
function DepthBar({ value }: { value: number }): React.ReactElement {
  const clamped = Math.min(100, Math.max(0, value));
  const color = clamped < 50 ? "#34d399" : clamped < 80 ? "#fbbf24" : "#f87171";
  const data = [{ fill: clamped, empty: 100 - clamped }];

  return (
    <div className="flex flex-col justify-center h-full gap-3 px-2">
      <div className="flex justify-between text-xs font-dm-sans" style={{ color: "var(--color-text-secondary)" }}>
        <span>0%</span>
        <span style={{ color }}>{clamped.toFixed(1)}% full</span>
        <span>100%</span>
      </div>
      <div className="relative h-8 rounded-full overflow-hidden" style={{ background: "rgba(148,163,184,0.10)" }}>
        <div
          className="absolute inset-y-0 left-0 rounded-full transition-all duration-700"
          style={{
            width: `${clamped}%`,
            background: `linear-gradient(90deg, #34d399 0%, ${color} 100%)`,
            boxShadow: `0 0 12px ${color}66`,
          }}
        />
      </div>
      <div className="flex justify-between text-[10px] font-dm-sans" style={{ color: "var(--color-text-secondary)" }}>
        <span style={{ color: "#34d399" }}>● Safe (0–50%)</span>
        <span style={{ color: "#fbbf24" }}>● Warning (50–80%)</span>
        <span style={{ color: "#f87171" }}>● Critical (80–100%)</span>
      </div>
    </div>
  );
}

export function SensorChart({
  title,
  data,
  color = "#22d3ee",
  unit = "",
  variant = "area",
  dangerThreshold,
}: Props): React.ReactElement {
  const series = useMemo(
    () =>
      data.map((d) => ({
        t: new Date(d.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        v: d.value,
      })),
    [data],
  );

  const latestValue = data.length > 0 ? data[data.length - 1].value : 0;

  const tooltipStyle = {
    background: "var(--surface-strong)",
    border: "1px solid var(--border)",
    borderRadius: 10,
    color: "var(--fg)",
    fontSize: 12,
  };
  const axisStyle = { fill: "var(--fg-subtle)", fontSize: 11 };

  const gradId = `grad-${title.replace(/\s/g, "")}`;

  return (
    <div
      className="rounded-2xl border p-4 flex flex-col"
      style={{
        background: "var(--surface)",
        borderColor: "var(--border)",
        backdropFilter: "blur(14px)",
        height: 288,
      }}
    >
      <h3
        className="font-syne font-semibold text-sm mb-3 text-center"
        style={{ color: "var(--color-text-primary)" }}
      >
        {title}
      </h3>

      <div className="flex-1">
        {/* ── Radial Gauge variant (Humidity) ── */}
        {variant === "gauge" ? (
          <RadialGauge value={latestValue} unit={unit} color={color} />
        ) : variant === "bar" ? (
          /* ── Stacked bar (Depth) ── */
          <DepthBar value={latestValue} />
        ) : (
          /* ── Area / Threshold line charts ── */
          <ResponsiveContainer width="100%" height="100%">
            {variant === "area" ? (
              <AreaChart data={series} margin={{ top: 4, right: 12, left: -18, bottom: 0 }}>
                <defs>
                  <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={color} stopOpacity={0.4} />
                    <stop offset="100%" stopColor={color} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="rgba(148,163,184,0.08)" strokeDasharray="3 3" />
                <XAxis dataKey="t" tick={axisStyle} tickLine={false} axisLine={false} />
                <YAxis tick={axisStyle} tickLine={false} axisLine={false} />
                <Tooltip
                  contentStyle={tooltipStyle}
                  formatter={(v: number) => [`${v}${unit ? ` ${unit}` : ""}`, "value"]}
                />
                <Area
                  type="monotoneX"
                  dataKey="v"
                  stroke={color}
                  strokeWidth={2}
                  fill={`url(#${gradId})`}
                  dot={false}
                  activeDot={{ r: 4, fill: color, strokeWidth: 0 }}
                  isAnimationActive={false}
                />
              </AreaChart>
            ) : (
              /* variant === "threshold" */
              <LineChart data={series} margin={{ top: 4, right: 12, left: -18, bottom: 0 }}>
                <CartesianGrid stroke="rgba(148,163,184,0.08)" strokeDasharray="3 3" />
                <XAxis dataKey="t" tick={axisStyle} tickLine={false} axisLine={false} />
                <YAxis tick={axisStyle} tickLine={false} axisLine={false} />
                <Tooltip
                  contentStyle={tooltipStyle}
                  formatter={(v: number) => [`${v}${unit ? ` ${unit}` : ""}`, "value"]}
                />
                {dangerThreshold != null && (
                  <ReferenceLine
                    y={dangerThreshold}
                    stroke="#f87171"
                    strokeDasharray="6 3"
                    label={{ value: `Alert: ${dangerThreshold}`, fill: "#f87171", fontSize: 10 }}
                  />
                )}
                <Line
                  type="monotone"
                  dataKey="v"
                  stroke={color}
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4, fill: color, strokeWidth: 0 }}
                  isAnimationActive={false}
                />
              </LineChart>
            )}
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
