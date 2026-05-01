"use client";
import { useState } from "react";
import { reports } from "@/lib/api";
import { Card, CardBody, CardHeader, CardTitle, Chip } from "@/components/ui/Primitives";
import { useT, SUPPORTED_LOCALES } from "@/lib/i18n";
import { useTheme } from "@/lib/theme";
import { GlobeIcon, MoonIcon, NavigationIcon, SunIcon } from "@/components/IconsExtended";

const CATEGORIES = ["OVERFLOW", "DAMAGE", "BAD_SMELL", "MISSING", "OTHER"] as const;

export default function CitizenReportPage(): React.ReactElement {
  const { t, locale, setLocale } = useT();
  const { theme, toggle } = useTheme();
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<typeof CATEGORIES[number]>("OVERFLOW");
  const [contactName, setContactName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [website, setWebsite] = useState(""); // honeypot — must stay empty
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const useLocation = () => {
    if (!navigator.geolocation) { setErr("Geolocation unavailable"); return; }
    navigator.geolocation.getCurrentPosition(
      (pos) => setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => setErr("Could not get your location — please continue without it."),
      { enableHighAccuracy: true, timeout: 8_000 }
    );
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null); setLoading(true);
    try {
      await reports.submit({
        description: description.trim(),
        category,
        lat: coords?.lat,
        lng: coords?.lng,
        contactName: contactName.trim() || undefined,
        contactEmail: contactEmail.trim() || undefined,
        contactPhone: contactPhone.trim() || undefined,
        website,
      });
      setDone(true);
    } catch (e) {
      const ex = e as { response?: { data?: { error?: string } } };
      setErr(ex?.response?.data?.error ?? "Submission failed — please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-2xl">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl ring-grad grid place-items-center font-extrabold text-white" style={{ background: "var(--accent-grad)" }}>CT</div>
            <div>
              <div className="font-semibold">Coral Telecom</div>
              <div className="text-[10px] uppercase tracking-[0.18em]" style={{ color: "var(--fg-muted)" }}>Citizen portal</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={toggle} className="btn btn-ghost" aria-label="Toggle theme">{theme === "dark" ? <SunIcon /> : <MoonIcon />}</button>
            <select value={locale} onChange={(e) => setLocale(e.target.value as never)} className="select max-w-[110px]" aria-label="Language">
              {SUPPORTED_LOCALES.map((l) => <option key={l.code} value={l.code}>{l.flag} {l.code.toUpperCase()}</option>)}
            </select>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>{t("citizen.title")}</CardTitle>
            <Chip tone="info">No account needed</Chip>
          </CardHeader>
          <CardBody>
            <p className="text-sm mb-4" style={{ color: "var(--fg-muted)" }}>{t("citizen.subtitle")}</p>

            {done ? (
              <div className="text-center py-10 rise">
                <div className="mx-auto h-16 w-16 rounded-full grid place-items-center mb-3" style={{ background: "rgba(52,211,153,0.15)" }}>
                  <span style={{ color: "var(--success)", fontSize: 32 }}>✓</span>
                </div>
                <h3 className="text-xl font-semibold">{t("citizen.thanks")}</h3>
                <p className="text-sm mt-1" style={{ color: "var(--fg-muted)" }}>
                  Your report has been forwarded to operations.
                </p>
                <button onClick={() => { setDone(false); setDescription(""); setCoords(null); }} className="btn mt-6">
                  Submit another
                </button>
              </div>
            ) : (
              <form onSubmit={submit} className="space-y-4" autoComplete="off">
                {/* Honeypot — invisible to humans, irresistible to bots. */}
                <div className="hidden" aria-hidden>
                  <label>Website
                    <input type="text" tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} />
                  </label>
                </div>

                <div>
                  <label className="label">{t("citizen.category")}</label>
                  <div className="mt-1 flex flex-wrap gap-2">
                    {CATEGORIES.map((c) => (
                      <button key={c} type="button" onClick={() => setCategory(c)}
                              className={`btn btn-sm ${category === c ? "btn-primary" : ""}`}>
                        {c.replace("_", " ")}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="label" htmlFor="desc">{t("citizen.description")}</label>
                  <textarea id="desc" required minLength={5} maxLength={1000} rows={4}
                            className="textarea mt-1" placeholder={t("citizen.descriptionPh")}
                            value={description} onChange={(e) => setDescription(e.target.value)} />
                  <div className="text-[10px] mt-1 text-right" style={{ color: "var(--fg-subtle)" }}>{description.length}/1000</div>
                </div>

                <div>
                  <label className="label">Location</label>
                  <div className="mt-1 flex items-center gap-2 flex-wrap">
                    <button type="button" onClick={useLocation} className="btn btn-sm">
                      <NavigationIcon /> {t("citizen.useLocation")}
                    </button>
                    {coords ? (
                      <Chip tone="success">{coords.lat.toFixed(5)}, {coords.lng.toFixed(5)}</Chip>
                    ) : (
                      <span className="text-xs" style={{ color: "var(--fg-muted)" }}>Optional but very helpful</span>
                    )}
                  </div>
                </div>

                <details className="rounded-lg" style={{ background: "var(--surface-2)", padding: 12 }}>
                  <summary className="cursor-pointer text-sm font-medium">{t("citizen.contact")}</summary>
                  <div className="mt-3 grid sm:grid-cols-3 gap-3">
                    <input className="input" placeholder="Name" value={contactName} onChange={(e) => setContactName(e.target.value)} />
                    <input className="input" type="email" placeholder="Email" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} />
                    <input className="input" type="tel" placeholder="Phone" value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} />
                  </div>
                </details>

                {err ? <div className="chip danger">{err}</div> : null}

                <button type="submit" disabled={loading || description.trim().length < 5} className="btn btn-primary w-full">
                  {loading ? "Submitting…" : t("common.submit")}
                </button>
                <p className="text-[11px] text-center" style={{ color: "var(--fg-subtle)" }}>
                  We'll only use your contact details to follow up on this report.
                </p>
              </form>
            )}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
