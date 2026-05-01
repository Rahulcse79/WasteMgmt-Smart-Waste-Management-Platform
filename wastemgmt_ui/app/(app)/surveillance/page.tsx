"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";

interface Camera {
  name: string;
  url: string;
  enabled?: boolean;
}

interface PublicConfig {
  cameras: Camera[];
}

export default function SurveillancePage(): React.ReactElement {
  const [cameras, setCameras] = useState<Camera[]>([]);

  useEffect(() => {
    api
      .get<PublicConfig>("/config/public")
      .then((r) => setCameras((r.data.cameras ?? []).filter((c) => c.enabled !== false)))
      .catch(() => setCameras([]));
  }, []);

  return (
    <div className="p-6 space-y-4">
      <h1 className="text-center text-xl font-semibold text-white">
        Live Coral Surveillance Camera Feed
      </h1>

      {cameras.length === 0 ? (
        <div className="rounded-xl bg-[var(--panel)] border border-[var(--border)] p-10 text-center text-zinc-400 text-sm">
          No camera streams configured. An administrator can add cameras under{" "}
          <span className="text-cyan-300">Admin → Cameras</span>.
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {cameras.map((cam, i) => (
            <div
              key={`${cam.url}-${i}`}
              className="rounded-xl bg-[var(--panel)] border border-[var(--border)] overflow-hidden relative h-[450px]"
            >
              <span className="absolute top-3 left-3 z-10 inline-flex items-center gap-1.5 bg-black/70 text-white text-xs px-2 py-1 rounded-full">
                <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" /> Live
              </span>
              <span className="absolute top-3 right-3 z-10 bg-black/70 text-white text-xs px-2 py-1 rounded">
                {cam.name}
              </span>
              <iframe
                src={cam.url}
                className="w-full h-full bg-black"
                sandbox="allow-same-origin allow-scripts allow-presentation"
                referrerPolicy="no-referrer"
                allow="autoplay; fullscreen; picture-in-picture"
                title={cam.name}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
