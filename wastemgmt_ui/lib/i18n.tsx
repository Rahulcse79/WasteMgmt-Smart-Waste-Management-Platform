"use client";
import { createContext, useCallback, useContext, useEffect, useState } from "react";

/**
 * Tiny i18n: dictionaries keyed by namespace, dot-paths for keys, and a
 * `t(key, vars)` helper that interpolates {{name}} placeholders.
 * No external dep — keeps the bundle small.
 */
type Locale = "en" | "hi" | "fr" | "es";

type Dict = Record<string, string>;
const DICTS: Record<Locale, Dict> = {
  en: {
    "nav.dashboard": "Dashboard",
    "nav.analytics": "Analytics",
    "nav.alerts": "Alerts",
    "nav.notifications": "Notifications",
    "nav.surveillance": "Surveillance",
    "nav.driver": "Driver",
    "nav.routes": "Route planner",
    "nav.account": "Your account",
    "nav.dustbins": "Dustbins",
    "nav.users": "Users",
    "nav.cameras": "Cameras",
    "nav.rules": "Rules",
    "nav.audit": "Audit log",
    "nav.reports": "Citizen reports",
    "nav.settings": "Settings",
    "common.signedInAs": "Signed in as",
    "common.signOut": "Sign out",
    "common.loading": "Loading…",
    "common.empty": "Nothing here yet.",
    "common.search": "Search…",
    "common.export": "Export",
    "common.refresh": "Refresh",
    "common.save": "Save",
    "common.cancel": "Cancel",
    "common.submit": "Submit",
    "common.live": "Live",
    "kpi.totalBins": "Total bins",
    "kpi.online": "Online",
    "kpi.critical": "Critical",
    "kpi.warning": "Warning",
    "kpi.healthy": "Healthy",
    "kpi.avgFill": "Average fill",
    "kpi.openAlerts": "Open alerts",
    "kpi.openReports": "Open reports",
    "login.title": "Welcome back",
    "login.subtitle": "Sign in to your operations dashboard.",
    "login.username": "Username",
    "login.password": "Password",
    "login.submit": "Sign in",
    "login.signing": "Signing in…",
    "login.hint": "Use credentials provisioned by your administrator.",
    "citizen.title": "Report a problem",
    "citizen.subtitle": "Help keep your city clean — let us know what's wrong.",
    "citizen.description": "Describe the problem",
    "citizen.descriptionPh": "e.g. The bin near the school is overflowing onto the pavement.",
    "citizen.category": "Category",
    "citizen.contact": "Contact (optional)",
    "citizen.useLocation": "Use my current location",
    "citizen.thanks": "Thank you! Your report was received.",
  },
  hi: {
    "nav.dashboard": "डैशबोर्ड",
    "nav.analytics": "विश्लेषण",
    "nav.alerts": "अलर्ट",
    "nav.notifications": "सूचनाएँ",
    "nav.surveillance": "निगरानी",
    "nav.driver": "ड्राइवर",
    "nav.routes": "मार्ग योजना",
    "nav.account": "आपका खाता",
    "nav.dustbins": "कूड़ेदान",
    "nav.users": "उपयोगकर्ता",
    "nav.cameras": "कैमरे",
    "nav.rules": "नियम",
    "nav.audit": "ऑडिट लॉग",
    "nav.reports": "नागरिक रिपोर्ट",
    "nav.settings": "सेटिंग्स",
    "common.signedInAs": "लॉग इन है",
    "common.signOut": "लॉग आउट",
    "common.loading": "लोड हो रहा है…",
    "common.empty": "अभी कुछ नहीं।",
    "common.search": "खोज…",
    "common.export": "निर्यात",
    "common.refresh": "रिफ्रेश",
    "common.save": "सहेजें",
    "common.cancel": "रद्द",
    "common.submit": "भेजें",
    "common.live": "लाइव",
    "kpi.totalBins": "कुल कूड़ेदान",
    "kpi.online": "ऑनलाइन",
    "kpi.critical": "गंभीर",
    "kpi.warning": "चेतावनी",
    "kpi.healthy": "स्वस्थ",
    "kpi.avgFill": "औसत भराव",
    "kpi.openAlerts": "खुले अलर्ट",
    "kpi.openReports": "खुली रिपोर्ट",
    "login.title": "वापसी पर स्वागत है",
    "login.subtitle": "अपने ऑपरेशन डैशबोर्ड में साइन इन करें।",
    "login.username": "उपयोगकर्ता",
    "login.password": "पासवर्ड",
    "login.submit": "साइन इन",
    "login.signing": "साइन इन हो रहा है…",
    "login.hint": "व्यवस्थापक द्वारा दिए गए क्रेडेंशियल का उपयोग करें।",
    "citizen.title": "समस्या की रिपोर्ट करें",
    "citizen.subtitle": "अपने शहर को साफ रखने में मदद करें — समस्या बताएँ।",
    "citizen.description": "समस्या का वर्णन करें",
    "citizen.descriptionPh": "जैसे: स्कूल के पास का कूड़ेदान भर गया है।",
    "citizen.category": "श्रेणी",
    "citizen.contact": "संपर्क (वैकल्पिक)",
    "citizen.useLocation": "मेरा वर्तमान स्थान उपयोग करें",
    "citizen.thanks": "धन्यवाद! आपकी रिपोर्ट प्राप्त हुई।",
  },
  fr: {
    "nav.dashboard": "Tableau de bord",
    "nav.analytics": "Analyses",
    "nav.alerts": "Alertes",
    "nav.notifications": "Notifications",
    "nav.surveillance": "Surveillance",
    "nav.driver": "Chauffeur",
    "nav.routes": "Itinéraire",
    "nav.account": "Mon compte",
    "nav.dustbins": "Poubelles",
    "nav.users": "Utilisateurs",
    "nav.cameras": "Caméras",
    "nav.rules": "Règles",
    "nav.audit": "Journal d'audit",
    "nav.reports": "Signalements",
    "nav.settings": "Paramètres",
    "common.signedInAs": "Connecté",
    "common.signOut": "Déconnexion",
    "common.loading": "Chargement…",
    "common.empty": "Rien pour l'instant.",
    "common.search": "Rechercher…",
    "common.export": "Exporter",
    "common.refresh": "Actualiser",
    "common.save": "Enregistrer",
    "common.cancel": "Annuler",
    "common.submit": "Envoyer",
    "common.live": "En direct",
    "kpi.totalBins": "Total poubelles",
    "kpi.online": "En ligne",
    "kpi.critical": "Critique",
    "kpi.warning": "Attention",
    "kpi.healthy": "Saines",
    "kpi.avgFill": "Remplissage moy.",
    "kpi.openAlerts": "Alertes ouvertes",
    "kpi.openReports": "Signalements ouverts",
    "login.title": "Bon retour",
    "login.subtitle": "Connectez-vous à votre tableau de bord.",
    "login.username": "Identifiant",
    "login.password": "Mot de passe",
    "login.submit": "Se connecter",
    "login.signing": "Connexion…",
    "login.hint": "Identifiants fournis par votre administrateur.",
    "citizen.title": "Signaler un problème",
    "citizen.subtitle": "Aidez à garder la ville propre.",
    "citizen.description": "Décrivez le problème",
    "citizen.descriptionPh": "Ex. La poubelle près de l'école déborde.",
    "citizen.category": "Catégorie",
    "citizen.contact": "Contact (facultatif)",
    "citizen.useLocation": "Utiliser ma position",
    "citizen.thanks": "Merci ! Votre signalement a été reçu.",
  },
  es: {
    "nav.dashboard": "Panel",
    "nav.analytics": "Analítica",
    "nav.alerts": "Alertas",
    "nav.notifications": "Notificaciones",
    "nav.surveillance": "Vigilancia",
    "nav.driver": "Conductor",
    "nav.routes": "Rutas",
    "nav.account": "Tu cuenta",
    "nav.dustbins": "Contenedores",
    "nav.users": "Usuarios",
    "nav.cameras": "Cámaras",
    "nav.rules": "Reglas",
    "nav.audit": "Registro",
    "nav.reports": "Reportes ciudadanos",
    "nav.settings": "Ajustes",
    "common.signedInAs": "Conectado",
    "common.signOut": "Salir",
    "common.loading": "Cargando…",
    "common.empty": "Aún nada.",
    "common.search": "Buscar…",
    "common.export": "Exportar",
    "common.refresh": "Actualizar",
    "common.save": "Guardar",
    "common.cancel": "Cancelar",
    "common.submit": "Enviar",
    "common.live": "En vivo",
    "kpi.totalBins": "Contenedores",
    "kpi.online": "En línea",
    "kpi.critical": "Crítico",
    "kpi.warning": "Atención",
    "kpi.healthy": "Saludables",
    "kpi.avgFill": "Llenado prom.",
    "kpi.openAlerts": "Alertas abiertas",
    "kpi.openReports": "Reportes abiertos",
    "login.title": "Bienvenido",
    "login.subtitle": "Accede a tu panel.",
    "login.username": "Usuario",
    "login.password": "Contraseña",
    "login.submit": "Entrar",
    "login.signing": "Entrando…",
    "login.hint": "Usa las credenciales que te dio tu administrador.",
    "citizen.title": "Reportar un problema",
    "citizen.subtitle": "Ayúdanos a mantener la ciudad limpia.",
    "citizen.description": "Describe el problema",
    "citizen.descriptionPh": "Ej. El contenedor de la plaza está desbordado.",
    "citizen.category": "Categoría",
    "citizen.contact": "Contacto (opcional)",
    "citizen.useLocation": "Usar mi ubicación",
    "citizen.thanks": "¡Gracias! Recibimos tu reporte.",
  },
};

const KEY = "wm.locale";

const I18nCtx = createContext<{
  locale: Locale;
  setLocale: (l: Locale) => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
} | null>(null);

export function I18nProvider({ children }: { children: React.ReactNode }): React.ReactElement {
  const [locale, setLocaleState] = useState<Locale>("en");

  useEffect(() => {
    if (typeof window === "undefined") return;
    const saved = window.localStorage.getItem(KEY) as Locale | null;
    if (saved && saved in DICTS) setLocaleState(saved);
  }, []);

  const setLocale = useCallback((l: Locale) => {
    setLocaleState(l);
    if (typeof window !== "undefined") window.localStorage.setItem(KEY, l);
    if (typeof document !== "undefined") document.documentElement.lang = l;
  }, []);

  const t = useCallback(
    (key: string, vars?: Record<string, string | number>) => {
      const dict = DICTS[locale] ?? DICTS.en;
      let s = dict[key] ?? DICTS.en[key] ?? key;
      if (vars) {
        for (const [k, v] of Object.entries(vars)) {
          s = s.replace(new RegExp(`\\{\\{\\s*${k}\\s*\\}\\}`, "g"), String(v));
        }
      }
      return s;
    },
    [locale]
  );

  return <I18nCtx.Provider value={{ locale, setLocale, t }}>{children}</I18nCtx.Provider>;
}

export function useT(): { locale: Locale; setLocale: (l: Locale) => void; t: (k: string, v?: Record<string, string | number>) => string } {
  const ctx = useContext(I18nCtx);
  if (!ctx) throw new Error("useT must be used inside I18nProvider");
  return ctx;
}

export const SUPPORTED_LOCALES: Array<{ code: Locale; label: string; flag: string }> = [
  { code: "en", label: "English", flag: "🇬🇧" },
  { code: "hi", label: "हिन्दी", flag: "🇮🇳" },
  { code: "fr", label: "Français", flag: "🇫🇷" },
  { code: "es", label: "Español", flag: "🇪🇸" },
];
