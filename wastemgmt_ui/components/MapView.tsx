"use client";
import { useEffect, useMemo } from "react";
import L from "leaflet";
import { MapContainer, Marker, Popup, TileLayer, useMap } from "react-leaflet";
import type { Dustbin } from "@/lib/types";
import { fillColor, latestOf } from "@/lib/types";

// Fix default marker icons not loading from CDN under bundlers
// eslint-disable-next-line @typescript-eslint/no-explicit-any
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

function FitBounds({ items }: { items: Dustbin[] }): null {
  const map = useMap();
  useEffect(() => {
    if (items.length === 0) return;
    const bounds = L.latLngBounds(items.map((i) => [i.latitude, i.longitude] as [number, number]));
    map.fitBounds(bounds.pad(0.2), { animate: true });
  }, [items, map]);
  return null;
}

export function MapView({
  dustbins,
  height = 480,
  center,
}: {
  dustbins: Dustbin[];
  height?: number;
  center?: [number, number];
}): React.ReactElement {
  const initialCenter = useMemo<[number, number]>(() => {
    if (center) return center;
    if (dustbins[0]) return [dustbins[0].latitude, dustbins[0].longitude];
    return [21.1458, 79.0882]; // Nagpur fallback
  }, [center, dustbins]);

  return (
    <MapContainer
      center={initialCenter}
      zoom={12}
      style={{ height, width: "100%", borderRadius: 12 }}
      scrollWheelZoom
    >
      <TileLayer
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
      />
      <FitBounds items={dustbins} />
      {dustbins.map((d) => {
        const depth = latestOf(d.depth, d.latest?.depth);
        const colour = fillColor(depth);
        const icon = L.divIcon({
          className: "wm-marker",
          html: `<div style="width:18px;height:18px;background:${colour};border-radius:9999px;box-shadow:0 2px 6px rgba(0,0,0,0.4);border:2px solid rgba(255,255,255,0.85)"></div>`,
          iconSize: [18, 18],
          iconAnchor: [9, 9],
        });
        return (
          <Marker key={d.dustbinId} position={[d.latitude, d.longitude]} icon={icon}>
            <Popup>
              <div className="min-w-[180px]">
                <div className="font-semibold mb-1">{d.dustbinName}</div>
                <div className="text-xs text-zinc-400 mb-2">{d.dustbinId}</div>
                <ul className="text-sm space-y-0.5">
                  <li>
                    <span className="text-zinc-400">Depth:</span>{" "}
                    <span className="font-medium">{depth?.toFixed(2) ?? "—"} %</span>
                  </li>
                  <li>
                    <span className="text-zinc-400">Gas:</span>{" "}
                    <span className="font-medium">
                      {latestOf(d.gas, d.latest?.gas) ?? "—"} ppm
                    </span>
                  </li>
                  <li>
                    <span className="text-zinc-400">Temp:</span>{" "}
                    <span className="font-medium">
                      {latestOf(d.temperature, d.latest?.temperature) ?? "—"} °C
                    </span>
                  </li>
                  <li>
                    <span className="text-zinc-400">Humidity:</span>{" "}
                    <span className="font-medium">
                      {latestOf(d.humidity, d.latest?.humidity) ?? "—"} %
                    </span>
                  </li>
                </ul>
              </div>
            </Popup>
          </Marker>
        );
      })}
    </MapContainer>
  );
}
