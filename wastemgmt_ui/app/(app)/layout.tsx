"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Sidebar } from "@/components/Sidebar";
import { TopBar } from "@/components/TopBar";
import { Chatbot } from "@/components/Chatbot";
import { auth } from "@/lib/api";

export default function AppLayout({ children }: { children: React.ReactNode }): React.ReactElement | null {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    if (!auth.token()) {
      router.replace("/login");
      return;
    }
    setReady(true);
  }, [router]);

  if (!ready) return null;

  return (
    <div className="flex flex-1 min-h-screen">
      <Sidebar mobileOpen={mobileOpen} onMobileClose={() => setMobileOpen(false)} />
      <div className="flex-1 flex flex-col min-w-0">
        <TopBar onMobileMenu={() => setMobileOpen(true)} />
        <main className="flex-1 overflow-auto p-3 md:p-4">{children}</main>
      </div>
      {/* Floating AI assistant — available on all app pages */}
      <Chatbot />
    </div>
  );
}
