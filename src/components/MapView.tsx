import { Suspense, lazy, useEffect, useState } from "react";
import type { MapPoint } from "./LiveMap";

const LiveMap = lazy(() => import("./LiveMap"));

export type { MapPoint };

export function MapView({
  points,
  height = 380,
  trail,
  follow,
}: {
  points: MapPoint[];
  height?: number;
  trail?: { lat: number; lng: number }[] | undefined;
  follow?: boolean | undefined;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const placeholder = (
    <div
      className="grid place-items-center rounded-2xl border border-dashed border-white/15 bg-white/[0.02] text-xs font-semibold text-muted-foreground"
      style={{ height }}
    >
      Carregando mapa…
    </div>
  );

  if (!mounted) return placeholder;
  return (
    <Suspense fallback={placeholder}>
      <LiveMap points={points} height={height} trail={trail} follow={follow} />
    </Suspense>
  );
}
