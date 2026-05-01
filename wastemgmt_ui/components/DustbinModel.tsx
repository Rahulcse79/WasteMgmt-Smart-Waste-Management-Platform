"use client";

/**
 * DustbinModel — CSS 3D cylindrical dustbin with rising-liquid fill animation.
 * Fill level 0-100%: green (0-50%), amber (50-80%), red (80-100%).
 * Slow Y-axis rotation via CSS animation (.dustbin-body keyframe in globals.css).
 */

interface Props {
  fillPercent: number; // 0–100
  binId?: string;
}

function getFillColor(pct: number): string {
  if (pct >= 80) return "#f87171"; // red
  if (pct >= 50) return "#fbbf24"; // amber
  return "#34d399";                // green
}

function getFillGlow(pct: number): string {
  if (pct >= 80) return "0 0 24px rgba(248,113,113,0.6)";
  if (pct >= 50) return "0 0 24px rgba(251,191,36,0.6)";
  return "0 0 24px rgba(52,211,153,0.5)";
}

export function DustbinModel({ fillPercent, binId }: Props): React.ReactElement {
  const pct = Math.min(100, Math.max(0, fillPercent));
  const fillColor = getFillColor(pct);
  const fillGlow = getFillGlow(pct);
  const label = `${pct.toFixed(0)}%`;

  /* Dustbin dimensions (CSS px) */
  const W = 80;   // cylinder diameter
  const H = 110;  // cylinder height
  const LID_H = 14;
  const DEPTH = 20; // ellipse vertical radius

  /* Fill height within cylinder body */
  const fillH = (pct / 100) * H;
  const fillY = H - fillH; // top of fill inside body

  return (
    <div className="flex flex-col items-center gap-3 py-4" aria-label={`Dustbin fill: ${label}`}>
      <div className="dustbin-wrap" style={{ perspective: 600 }}>
        <div className="dustbin-body" style={{ transformStyle: "preserve-3d", width: W, position: "relative" }}>
          {/* ── Lid ── */}
          <div
            style={{
              position: "absolute",
              top: -(LID_H + 4),
              left: -6,
              width: W + 12,
              height: LID_H,
              background: "linear-gradient(180deg, rgba(148,163,184,0.35) 0%, rgba(100,116,139,0.25) 100%)",
              border: "1px solid rgba(148,163,184,0.25)",
              borderRadius: "50% 50% 8px 8px / 50% 50% 4px 4px",
              boxShadow: "0 -2px 8px rgba(0,0,0,0.3)",
            }}
          />

          {/* ── Top ellipse (open rim) ── */}
          <div
            style={{
              position: "absolute",
              top: -DEPTH / 2,
              left: 0,
              width: W,
              height: DEPTH,
              borderRadius: "50%",
              background: "rgba(15,22,41,0.9)",
              border: "2px solid rgba(148,163,184,0.2)",
              zIndex: 3,
            }}
          />

          {/* ── Cylinder body ── */}
          <div
            style={{
              width: W,
              height: H,
              borderRadius: "0 0 12px 12px",
              background: "linear-gradient(180deg, rgba(30,40,70,0.9) 0%, rgba(15,22,41,0.95) 100%)",
              border: "2px solid rgba(148,163,184,0.15)",
              position: "relative",
              overflow: "hidden",
            }}
          >
            {/* Fill liquid */}
            {pct > 0 && (
              <div
                style={{
                  position: "absolute",
                  bottom: 0,
                  left: 0,
                  right: 0,
                  height: `${pct}%`,
                  background: `linear-gradient(180deg, ${fillColor}99 0%, ${fillColor}cc 100%)`,
                  boxShadow: `inset 0 8px 16px ${fillColor}44, ${fillGlow}`,
                  transition: "height 1.2s cubic-bezier(.2,.8,.2,1), background 0.6s ease",
                  borderRadius: "0 0 10px 10px",
                }}
              >
                {/* Liquid surface shimmer */}
                <div
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    right: 0,
                    height: 6,
                    background: `linear-gradient(90deg, transparent 0%, ${fillColor}88 50%, transparent 100%)`,
                    borderRadius: "50%",
                    animation: "shimmer 2s linear infinite",
                    backgroundSize: "200% 100%",
                  }}
                />
              </div>
            )}

            {/* Percentage label */}
            <div
              style={{
                position: "absolute",
                inset: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontFamily: "var(--font-syne)",
                fontWeight: 800,
                fontSize: 20,
                color: "#fff",
                textShadow: "0 1px 4px rgba(0,0,0,0.7)",
                zIndex: 2,
                pointerEvents: "none",
              }}
            >
              {label}
            </div>
          </div>

          {/* ── Bottom ellipse ── */}
          <div
            style={{
              position: "absolute",
              bottom: -DEPTH / 2,
              left: 0,
              width: W,
              height: DEPTH,
              borderRadius: "50%",
              background: "rgba(10,15,30,0.95)",
              border: "2px solid rgba(148,163,184,0.15)",
            }}
          />
        </div>
      </div>

      {/* Status label */}
      <div
        className="text-xs font-dm-sans font-semibold px-3 py-1 rounded-full"
        style={{
          background: `${fillColor}22`,
          border: `1px solid ${fillColor}55`,
          color: fillColor,
          boxShadow: `0 0 8px ${fillColor}44`,
        }}
      >
        {pct >= 80 ? "Critical" : pct >= 50 ? "Warning" : "Normal"} · {label}
      </div>
      {binId ? (
        <div className="text-[11px] font-dm-sans" style={{ color: "var(--color-text-secondary)" }}>
          {binId}
        </div>
      ) : null}
    </div>
  );
}
