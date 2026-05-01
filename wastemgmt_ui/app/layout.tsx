import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Syne, DM_Sans } from "next/font/google";
import "leaflet/dist/leaflet.css";
import "./globals.css";
import { ThemeProvider } from "@/lib/theme";
import { I18nProvider } from "@/lib/i18n";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });
// Brand fonts: Syne (geometric headings) + DM Sans (body)
const syne = Syne({ variable: "--font-syne", subsets: ["latin"], weight: ["400", "600", "700", "800"] });
const dmSans = DM_Sans({ variable: "--font-dm-sans", subsets: ["latin"], weight: ["400", "500", "600"] });

export const metadata: Metadata = {
  title: "Coral · Smart Waste Operations",
  description:
    "Real-time IoT operations console for municipal waste collection — live bin telemetry, route optimisation, citizen reports, and analytics.",
  applicationName: "Coral Smart Waste",
  themeColor: "#060814",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#060814",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      data-theme="dark"
      className={`${geistSans.variable} ${geistMono.variable} ${syne.variable} ${dmSans.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col">
        {/* Aurora background lives at root so it shines through every page */}
        <div className="aurora-bg" aria-hidden>
          <span className="aurora-orb a" />
          <span className="aurora-orb b" />
          <span className="aurora-orb c" />
        </div>
        <ThemeProvider>
          <I18nProvider>{children}</I18nProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
