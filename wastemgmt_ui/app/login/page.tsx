"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { auth } from "@/lib/api";
import { useT } from "@/lib/i18n";
import { useTheme } from "@/lib/theme";
import { GlobeIcon, MoonIcon, SparklesIcon, SunIcon } from "@/components/IconsExtended";

/* ── Particle telemetry map rendered on a <canvas> ── */
function TelemetryCanvas(): React.ReactElement {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const resize = () => {
      canvas.width = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    type Node = { x: number; y: number; r: number; vx: number; vy: number; hue: number };
    const nodes: Node[] = Array.from({ length: 28 }, () => ({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      r: 3 + Math.random() * 5,
      vx: (Math.random() - 0.5) * 0.35,
      vy: (Math.random() - 0.5) * 0.35,
      hue: Math.random() > 0.5 ? 172 : 250,
    }));

    let raf: number;
    let tick = 0;
    const draw = () => {
      tick++;
      const w = canvas.width, h = canvas.height;
      ctx.clearRect(0, 0, w, h);

      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const dx = nodes[i].x - nodes[j].x;
          const dy = nodes[i].y - nodes[j].y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 140) {
            ctx.beginPath();
            ctx.moveTo(nodes[i].x, nodes[i].y);
            ctx.lineTo(nodes[j].x, nodes[j].y);
            ctx.strokeStyle = `rgba(0,201,167,${(1 - dist / 140) * 0.25})`;
            ctx.lineWidth = 1;
            ctx.stroke();
          }
        }
      }

      for (const n of nodes) {
        const pulse = 1 + 0.15 * Math.sin(tick * 0.04 + n.x);
        const glowColor = n.hue === 172 ? "0,201,167" : "108,99,255";
        const grd = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, n.r * 3 * pulse);
        grd.addColorStop(0, `rgba(${glowColor},0.5)`);
        grd.addColorStop(1, `rgba(${glowColor},0)`);
        ctx.beginPath();
        ctx.arc(n.x, n.y, n.r * 3 * pulse, 0, Math.PI * 2);
        ctx.fillStyle = grd;
        ctx.fill();
        ctx.beginPath();
        ctx.arc(n.x, n.y, n.r * pulse, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${glowColor},0.9)`;
        ctx.fill();
        n.x += n.vx;
        n.y += n.vy;
        if (n.x < 0 || n.x > w) n.vx *= -1;
        if (n.y < 0 || n.y > h) n.vy *= -1;
      }

      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); };
  }, []);

  return <canvas ref={canvasRef} className="absolute inset-0 w-full h-full opacity-80" aria-hidden />;
}

/* ── Staggered word-reveal for the tagline ── */
function StaggeredText({ text, className = "" }: { text: string; className?: string }): React.ReactElement {
  return (
    <span className={`word-reveal ${className}`} aria-label={text}>
      {text.split(" ").map((word, i) => (
        <span key={i} style={{ animationDelay: `${0.08 * i + 0.3}s`, marginRight: "0.28em" }}>
          {word}
        </span>
      ))}
    </span>
  );
}

const FEATURES = [
  { label: "Live MQTT", icon: "\u26a1" },
  { label: "TSP Route", icon: "\U0001f5fa\ufe0f" },
  { label: "Citizen Reports", icon: "\U0001f4cb" },
  { label: "Overflow Alerts", icon: "\U0001f6a8" },
  { label: "CSV Exports", icon: "\U0001f4ca" },
];

export default function LoginPage(): React.ReactElement {
  const router = useRouter();
  const { t, locale, setLocale } = useT();
  const { theme, toggle } = useTheme();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await auth.login(username.trim(), password);
      router.replace("/dashboard");
    } catch (err) {
      const ex = err as { response?: { data?: { error?: string } } };
      setError(ex?.response?.data?.error ?? "Login failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col lg:flex-row" style={{ background: "var(--bg)" }}>
      {/* ── Left hero panel ── */}
      <section
        className="hidden lg:flex flex-col justify-between flex-1 px-12 py-10 relative overflow-hidden"
        style={{ background: "linear-gradient(145deg, #060d1f 0%, #0b1235 50%, #160829 100%)" }}
      >
        <TelemetryCanvas />
        <div className="absolute inset-0 bg-grid opacity-30 pointer-events-none" aria-hidden />

        {/* Brand */}
        <div className="relative z-10 flex items-center gap-3">
          <div
            className="relative h-12 w-12 rounded-2xl overflow-hidden flex items-center justify-center shadow-lg ring-grad"
            style={{ background: "var(--accent-coral)" }}
          >
            <Image src="/logo.png" alt="Coral Telecom" width={48} height={48} className="logo-img object-contain p-1.5" priority />
          </div>
          <div>
            <div className="font-syne font-bold tracking-tight text-base" style={{ color: "var(--color-text-primary)" }}>
              Coral Telecom
            </div>
            <div className="text-[10px] uppercase tracking-[0.2em] font-dm-sans" style={{ color: "var(--fg-muted)" }}>
              Smart Waste · Ops
            </div>
          </div>
        </div>

        {/* Hero copy */}
        <div className="relative z-10 space-y-6 max-w-xl">
          <div className="chip-glow inline-flex font-dm-sans">
            <SparklesIcon /> Realtime IoT control plane
          </div>
          <h1 className="font-syne font-extrabold text-5xl leading-[1.12] tracking-tight">
            <StaggeredText text="Run a" />{" "}
            <StaggeredText text="cleaner city" className="text-grad" />{" "}
            <StaggeredText text="with telemetry," />
            <br />
            <StaggeredText text="not guesswork." />
          </h1>
          <p className="font-dm-sans text-base max-w-md leading-relaxed" style={{ color: "var(--fg-muted)" }}>
            Live bin levels, predictive overflow alerts, optimised pickup routes,
            citizen reports and analytics — all in one operations console.
          </p>
          <div className="flex flex-wrap gap-2">
            {FEATURES.map((f, i) => (
              <span key={f.label} className="chip-glow font-dm-sans" style={{ animationDelay: `${i * 0.15 + 1.1}s` }}>
                <span>{f.icon}</span> {f.label}
              </span>
            ))}
          </div>
        </div>

        <div className="relative z-10 text-xs font-dm-sans" style={{ color: "var(--fg-subtle)" }}>
          {/* year rendered at runtime */}
          © 2026 Coral Telecom · Built for municipal sanitation operations.
        </div>
      </section>

      {/* ── Right form panel ── */}
      <section
        className="flex-1 flex items-center justify-center px-4 sm:px-8 py-10 relative"
        style={{ background: "var(--bg)" }}
      >
        {/* Theme + language controls */}
        <div className="absolute top-4 right-4 flex items-center gap-2 z-10">
          <button onClick={toggle} className="btn btn-ghost" aria-label="Toggle theme">
            <span key={theme} className="theme-icon-enter">
              {theme === "dark" ? <SunIcon /> : <MoonIcon />}
            </span>
          </button>
          <div className="relative">
            <select
              value={locale}
              onChange={(e) => setLocale(e.target.value as never)}
              className="select pr-8 text-xs"
              aria-label="Language"
              style={{ paddingRight: 28 }}
            >
              <option value="en">EN</option>
              <option value="hi">HI</option>
              <option value="fr">FR</option>
              <option value="es">ES</option>
            </select>
            <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 opacity-60"><GlobeIcon /></span>
          </div>
        </div>

        {/* Mobile brand (hidden on lg — hero panel shows it) */}
        <div className="lg:hidden absolute top-5 left-5 flex items-center gap-2">
          <div
            className="relative h-9 w-9 rounded-xl overflow-hidden flex items-center justify-center"
            style={{ background: "var(--accent-coral)" }}
          >
            <Image src="/logo.png" alt="Coral Telecom" width={36} height={36} className="logo-img object-contain p-1" priority />
          </div>
          <span className="font-syne font-bold text-sm" style={{ color: "var(--color-text-primary)" }}>Coral Telecom</span>
        </div>

        {/* Glassmorphism card */}
        <div className="w-full max-w-md glass rise p-8 sm:p-10 relative">
          {/* Gradient border ring */}
          <div
            aria-hidden
            className="absolute inset-0 rounded-2xl pointer-events-none"
            style={{
              background: "var(--accent-coral)",
              padding: "1px",
              WebkitMask: "linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)",
              WebkitMaskComposite: "xor",
              maskComposite: "exclude",
              borderRadius: "inherit",
            }}
          />

          <div className="flex flex-col items-center text-center mb-7">
            <div
              className="relative h-14 w-14 rounded-2xl overflow-hidden mb-3 flex items-center justify-center shadow-lg"
              style={{ background: "var(--accent-coral)" }}
            >
              <Image src="/logo.png" alt="Coral Telecom" width={56} height={56} className="logo-img object-contain p-2" />
            </div>
            <h2 className="font-syne font-bold text-2xl tracking-tight" style={{ color: "var(--color-text-primary)" }}>
              {t("login.title")}
            </h2>
            <p className="font-dm-sans text-sm mt-1" style={{ color: "var(--color-text-secondary)" }}>
              {t("login.subtitle")}
            </p>
          </div>

          <form onSubmit={onSubmit} className="space-y-4 font-dm-sans" autoComplete="off">
            <div>
              <label htmlFor="username" className="label" style={{ color: "var(--color-text-secondary)" }}>
                {t("login.username")}
              </label>
              <input
                id="username"
                type="text"
                autoComplete="off"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="input mt-1"
                placeholder="your-username"
                required
                spellCheck={false}
                autoCapitalize="off"
              />
            </div>
            <div>
              <label htmlFor="password" className="label" style={{ color: "var(--color-text-secondary)" }}>
                {t("login.password")}
              </label>
              <div className="relative mt-1">
                <input
                  id="password"
                  type={showPwd ? "text" : "password"}
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="input pr-16"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPwd((s) => !s)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-xs px-2 py-1 rounded hover:bg-white/5 font-dm-sans"
                  style={{ color: "var(--color-text-secondary)" }}
                  aria-label={showPwd ? "Hide password" : "Show password"}
                >
                  {showPwd ? "Hide" : "Show"}
                </button>
              </div>
            </div>

            {error ? (
              <div
                className="rounded-lg border text-xs px-3 py-2 font-dm-sans"
                style={{ background: "rgba(248,113,113,0.10)", borderColor: "rgba(248,113,113,0.35)", color: "#fecaca" }}
                role="alert"
              >
                {error}
              </div>
            ) : null}

            <button
              type="submit"
              disabled={submitting}
              className="btn btn-coral w-full py-3 text-sm font-syne font-bold tracking-wide"
            >
              {submitting ? t("login.signing") : t("login.submit")}
            </button>
          </form>

          <div className="mt-5 text-center text-xs font-dm-sans" style={{ color: "var(--fg-subtle)" }}>
            {t("login.hint")}
          </div>
          <div className="mt-3 text-center text-xs font-dm-sans">
            <Link href="/citizen" className="hover:underline transition-colors" style={{ color: "var(--color-accent)" }}>
              Not an operator? Submit a citizen report →
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
