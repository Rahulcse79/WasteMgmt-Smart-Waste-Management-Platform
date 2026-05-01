// Extended icon set for the redesigned shell. Zero deps — same SVG style as Icons.tsx.
import type { SVGProps } from "react";

const base: SVGProps<SVGSVGElement> = {
  width: 18,
  height: 18,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round",
  strokeLinejoin: "round",
};

export const ChartIcon = () => (
  <svg {...base}><path d="M3 3v18h18" /><path d="M7 14l3-3 3 3 5-6" /></svg>
);
export const TruckIcon = () => (
  <svg {...base}><path d="M1 6h13v9H1z" /><path d="M14 9h4l3 3v3h-7" /><circle cx="5.5" cy="17.5" r="2" /><circle cx="17.5" cy="17.5" r="2" /></svg>
);
export const RouteIcon = () => (
  <svg {...base}><circle cx="6" cy="19" r="3" /><circle cx="18" cy="5" r="3" /><path d="M6 16V8a4 4 0 0 1 4-4h4" /><path d="M18 8v8a4 4 0 0 1-4 4h-4" /></svg>
);
export const SunIcon = () => (
  <svg {...base}><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" /></svg>
);
export const MoonIcon = () => (
  <svg {...base}><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" /></svg>
);
export const GlobeIcon = () => (
  <svg {...base}><circle cx="12" cy="12" r="10" /><path d="M2 12h20" /><path d="M12 2a15 15 0 0 1 0 20a15 15 0 0 1 0-20z" /></svg>
);
export const SearchIcon = () => (
  <svg {...base}><circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" /></svg>
);
export const SparklesIcon = () => (
  <svg {...base}><path d="M12 3l1.7 4.5L18 9.2 13.7 11 12 15.5 10.3 11 6 9.2l4.3-1.7L12 3z" /><path d="M19 14l1 2.5L22 17.5 20 18.5 19 21l-1-2.5L16 17.5 18 16.5 19 14z" /></svg>
);
export const MenuIcon = () => (
  <svg {...base}><path d="M3 6h18M3 12h18M3 18h18" /></svg>
);
export const PlusIcon = () => (
  <svg {...base}><path d="M12 5v14M5 12h14" /></svg>
);
export const DownloadIcon = () => (
  <svg {...base}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><path d="M7 10l5 5 5-5" /><path d="M12 15V3" /></svg>
);
export const CheckIcon = () => (
  <svg {...base}><path d="M20 6 9 17l-5-5" /></svg>
);
export const XIcon = () => (
  <svg {...base}><path d="M18 6 6 18M6 6l12 12" /></svg>
);
export const FileTextIcon = () => (
  <svg {...base}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6M16 13H8M16 17H8M10 9H8" /></svg>
);
export const NavigationIcon = () => (
  <svg {...base}><path d="m3 11 19-9-9 19-2-8-8-2z" /></svg>
);
export const InfoIcon = () => (
  <svg {...base}><circle cx="12" cy="12" r="10" /><path d="M12 16v-4M12 8h.01" /></svg>
);
