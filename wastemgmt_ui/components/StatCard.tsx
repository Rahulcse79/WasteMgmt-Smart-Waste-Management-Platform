"use client";
import { useEffect, useRef, type ReactNode } from "react";

/* Animated counter using requestAnimationFrame */
function AnimatedValue({ target, unit }: { target: number | string; unit?: string }): React.ReactElement {
  const spanRef = useRef<HTMLSpanElement>(null);
  const prevRef = useRef<number>(0);

  useEffect(() => {
    if (typeof target !== "number") return;
    const start = prevRef.current;
    const end = target;
    const duration = 600;
    const startTime = performance.now();

    const tick = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      // Ease out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = start + (end - start) * eased;
      if (spanRef.current) {
        spanRef.current.textContent =
          Number.isInteger(end) ? Math.round(current).toString() : current.toFixed(2);
      }
      if (progress < 1) requestAnimationFrame(tick);
      else prevRef.current = end;
    };
    requestAnimationFrame(tick);
  }, [target]);

  if (typeof target !== "number") {
    return <span>{target}{unit ? <span className="text-base ml-1" style={{ color: "var(--fg-muted)" }}>{unit}</span> : null}</span>;
  }
  return (
    <span>
      <span ref={spanRef}>{typeof target === "number" ? target.toFixed(Number.isInteger(target) ? 0 : 2) : target}</span>
      {unit ? <span className="text-base ml-1" style={{ color: "var(--fg-muted)" }}>{unit}</span> : null}
    </span>
  );
}

const TONE_STYLES: Record<string, { bg: string; text: string; shadow: string }> = {
  cyan:    { bg: "linear-gradient(135deg,#0ea5e9,#06b6d4)", text: "#67e8f9", shadow: "0 0 20px rgba(6,182,212,0.4)" },
  rose:    { bg: "linear-gradient(135deg,#f43f5e,#e11d48)", text: "#fda4af", shadow: "0 0 20px rgba(244,63,94,0.4)" },
  amber:   { bg: "linear-gradient(135deg,#f59e0b,#d97706)", text: "#fcd34d", shadow: "0 0 20px rgba(245,158,11,0.4)" },
  emerald: { bg: "linear-gradient(135deg,#10b981,#059669)", text: "#6ee7b7", shadow: "0 0 20px rgba(16,185,129,0.4)" },
  coral:   { bg: "linear-gradient(135deg,#00C9A7,#6C63FF)", text: "#67e8f9", shadow: "0 0 20px rgba(0,201,167,0.4)" },
};

export function StatCard({
  label,
  value,
  unit,
  icon,
  tone = "cyan",
}: {
  label: string;
  value: string | number;
  unit?: string;
  icon?: ReactNode;
  tone?: "cyan" | "rose" | "amber" | "emerald" | "coral";
}): React.ReactElement {
  const style = TONE_STYLES[tone] ?? TONE_STYLES.cyan;

  return (
    <div className="kpi-card p-5 flex items-center gap-4">
      {/* Gradient icon badge */}
      <div
        className="h-13 w-13 shrink-0 rounded-2xl grid place-items-center text-xl shadow-lg"
        style={{
          background: style.bg,
          boxShadow: style.shadow,
          width: 52,
          height: 52,
        }}
        aria-hidden
      >
        {icon}
      </div>

      <div className="min-w-0">
        <div
          className="text-[11px] uppercase tracking-widest font-dm-sans truncate"
          style={{ color: "var(--color-text-secondary)" }}
        >
          {label}
        </div>
        <div
          className="text-2xl font-syne font-bold leading-tight"
          style={{ color: "var(--color-text-primary)" }}
        >
          <AnimatedValue target={value} unit={unit} />
        </div>
      </div>
    </div>
  );
}
