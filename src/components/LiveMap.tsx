import { useEffect, useRef, useState } from "react";
import { CircleMarker, MapContainer, Polyline, TileLayer, Tooltip, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";

export type MapPoint = {
  id: string;
  lat: number;
  lng: number;
  label: string;
  tone?: "courier" | "customer" | "store";
  animate?: boolean;
};

const COLORS: Record<string, string> = {
  courier: "#f59e0b",
  customer: "#ec4899",
  store: "#22c55e",
};

function Fit({ points, follow }: { points: MapPoint[]; follow?: boolean | undefined }) {
  const map = useMap();
  const key = points.map((p) => p.id).join("|");
  useEffect(() => {
    if (points.length === 0) return;
    if (points.length === 1) {
      map.setView([points[0]!.lat, points[0]!.lng], 15);
      return;
    }
    map.fitBounds(
      points.map((p) => [p.lat, p.lng] as [number, number]),
      { padding: [40, 40], maxZoom: 16 },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, key]);

  // segue suavemente o entregador nas atualizações seguintes
  const courier = points.find((p) => p.tone === "courier");
  useEffect(() => {
    if (!follow || !courier) return;
    map.panTo([courier.lat, courier.lng], { animate: true, duration: 1 });
  }, [map, follow, courier?.lat, courier?.lng]);
  return null;
}

/** Interpola a posição para o marcador "andar" no mapa em vez de pular. */
function useSmoothPosition(lat: number, lng: number, enabled: boolean) {
  const [pos, setPos] = useState<[number, number]>([lat, lng]);
  const fromRef = useRef<[number, number]>([lat, lng]);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (!enabled) {
      setPos([lat, lng]);
      return;
    }
    const from = fromRef.current;
    const start = performance.now();
    const duration = 1200;
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const ease = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
      const next: [number, number] = [
        from[0] + (lat - from[0]) * ease,
        from[1] + (lng - from[1]) * ease,
      ];
      setPos(next);
      if (t < 1) rafRef.current = requestAnimationFrame(step);
      else fromRef.current = [lat, lng];
    };
    rafRef.current = requestAnimationFrame(step);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [lat, lng, enabled]);

  return pos;
}

function SmoothMarker({ point }: { point: MapPoint }) {
  const [lat, lng] = useSmoothPosition(point.lat, point.lng, Boolean(point.animate));
  const color = COLORS[point.tone ?? "courier"];
  return (
    <>
      {point.animate && (
        <CircleMarker
          center={[lat, lng]}
          radius={20}
          pathOptions={{ color, weight: 1, fillColor: color, fillOpacity: 0.15 }}
        />
      )}
      <CircleMarker
        center={[lat, lng]}
        radius={10}
        pathOptions={{ color: "#ffffff", weight: 2, fillColor: color, fillOpacity: 0.95 }}
      >
        <Tooltip direction="top" offset={[0, -8]} permanent>
          {point.label}
        </Tooltip>
      </CircleMarker>
    </>
  );
}

export default function LiveMap({
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
  const center: [number, number] = points[0] ? [points[0].lat, points[0].lng] : [-2.4386, -54.6996];

  return (
    <div className="overflow-hidden rounded-2xl border border-white/10" style={{ height }}>
      <MapContainer
        center={center}
        zoom={13}
        style={{ height: "100%", width: "100%" }}
        scrollWheelZoom
      >
        <TileLayer
          attribution="&copy; OpenStreetMap"
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <Fit points={points} follow={follow} />
        {trail && trail.length > 1 && (
          <Polyline
            positions={trail.map((p) => [p.lat, p.lng] as [number, number])}
            pathOptions={{ color: COLORS["courier"], weight: 4, opacity: 0.7 }}
          />
        )}
        {points.map((point) => (
          <SmoothMarker key={point.id} point={point} />
        ))}
      </MapContainer>
    </div>
  );
}
