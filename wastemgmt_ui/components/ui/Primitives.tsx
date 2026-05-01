"use client";
import type { ReactNode, HTMLAttributes, ButtonHTMLAttributes } from "react";

// ── Glass card ──────────────────────────────────────────────────────────
export function Card(props: HTMLAttributes<HTMLDivElement> & { children: ReactNode }): React.ReactElement {
  const { className = "", children, ...rest } = props;
  return (
    <div className={`glass rise ${className}`} {...rest}>
      {children}
    </div>
  );
}

export function CardHeader({ children, className = "" }: { children: ReactNode; className?: string }): React.ReactElement {
  return <div className={`flex items-center justify-between gap-3 px-5 py-4 divider border-b ${className}`}>{children}</div>;
}

export function CardTitle({ children, className = "" }: { children: ReactNode; className?: string }): React.ReactElement {
  return <h2 className={`text-base font-semibold tracking-tight ${className}`}>{children}</h2>;
}

export function CardBody({ children, className = "" }: { children: ReactNode; className?: string }): React.ReactElement {
  return <div className={`p-5 ${className}`}>{children}</div>;
}

// ── Button ──────────────────────────────────────────────────────────────
type Variant = "primary" | "default" | "ghost" | "danger";
export function Button({
  variant = "default",
  size,
  className = "",
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: "sm" }): React.ReactElement {
  const v =
    variant === "primary" ? "btn btn-primary" : variant === "ghost" ? "btn btn-ghost" : variant === "danger" ? "btn btn-danger" : "btn";
  const s = size === "sm" ? "btn-sm" : "";
  return (
    <button className={`${v} ${s} ${className}`} {...rest}>
      {children}
    </button>
  );
}

// ── Badge / Chip ────────────────────────────────────────────────────────
export function Chip({
  tone = "default",
  children,
  className = "",
}: {
  tone?: "default" | "success" | "warning" | "danger" | "info";
  children: ReactNode;
  className?: string;
}): React.ReactElement {
  return <span className={`chip ${tone === "default" ? "" : tone} ${className}`}>{children}</span>;
}

// ── Skeleton ────────────────────────────────────────────────────────────
export function Skeleton({ className = "" }: { className?: string }): React.ReactElement {
  return <div className={`skeleton ${className}`} />;
}

// ── Empty state ─────────────────────────────────────────────────────────
export function EmptyState({
  title,
  hint,
  icon,
}: {
  title: string;
  hint?: string;
  icon?: ReactNode;
}): React.ReactElement {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <div className="mb-3 opacity-60">{icon}</div>
      <div className="font-medium" style={{ color: "var(--fg)" }}>{title}</div>
      {hint ? <div className="text-xs mt-1" style={{ color: "var(--fg-muted)" }}>{hint}</div> : null}
    </div>
  );
}

// ── KPI tile (the showpiece) ────────────────────────────────────────────
export function KpiTile({
  label,
  value,
  delta,
  tone = "default",
  icon,
  loading,
}: {
  label: string;
  value: string | number;
  delta?: { value: number; suffix?: string };
  tone?: "default" | "success" | "warning" | "danger" | "info";
  icon?: ReactNode;
  loading?: boolean;
}): React.ReactElement {
  const toneColor =
    tone === "success" ? "var(--success)" : tone === "warning" ? "var(--warning)" : tone === "danger" ? "var(--danger)" : tone === "info" ? "var(--info)" : "var(--accent)";
  return (
    <div className="glass rise relative overflow-hidden p-5">
      <div
        aria-hidden
        className="absolute -top-12 -right-12 h-32 w-32 rounded-full"
        style={{ background: toneColor, opacity: 0.18, filter: "blur(36px)" }}
      />
      <div className="flex items-center justify-between mb-3">
        <span className="label">{label}</span>
        <span style={{ color: toneColor }}>{icon}</span>
      </div>
      {loading ? (
        <Skeleton className="h-8 w-24" />
      ) : (
        <div className="text-3xl font-semibold tracking-tight">{value}</div>
      )}
      {delta ? (
        <div className="mt-2 text-xs" style={{ color: delta.value >= 0 ? "var(--success)" : "var(--danger)" }}>
          {delta.value >= 0 ? "▲" : "▼"} {Math.abs(delta.value)}{delta.suffix ?? ""}
        </div>
      ) : null}
    </div>
  );
}

// ── Mini sparkline (zero-dep SVG) ───────────────────────────────────────
export function Sparkline({
  values,
  width = 120,
  height = 36,
  color = "var(--accent)",
  fill = true,
}: {
  values: number[];
  width?: number;
  height?: number;
  color?: string;
  fill?: boolean;
}): React.ReactElement {
  if (values.length === 0) return <svg width={width} height={height} aria-hidden />;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const step = width / Math.max(1, values.length - 1);
  const pts = values.map((v, i) => {
    const x = i * step;
    const y = height - ((v - min) / span) * (height - 4) - 2;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const linePath = `M ${pts.join(" L ")}`;
  const areaPath = `${linePath} L ${width},${height} L 0,${height} Z`;
  return (
    <svg width={width} height={height} aria-hidden className="block">
      {fill ? <path d={areaPath} fill={color} opacity="0.15" /> : null}
      <path d={linePath} fill="none" stroke={color} strokeWidth="2" />
    </svg>
  );
}

// ── Fill bar ────────────────────────────────────────────────────────────
export function FillBar({ value }: { value: number }): React.ReactElement {
  const pct = Math.max(0, Math.min(100, value));
  const color = pct >= 80 ? "var(--danger)" : pct >= 50 ? "var(--warning)" : "var(--success)";
  return (
    <div className="w-full h-1.5 rounded-full overflow-hidden" style={{ background: "var(--surface-2)" }}>
      <div className="h-full transition-all" style={{ width: `${pct}%`, background: color }} />
    </div>
  );
}
