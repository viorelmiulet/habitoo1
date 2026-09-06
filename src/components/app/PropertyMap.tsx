/**
 * Hartă interactivă OpenStreetMap (Leaflet, fără cheie API) pentru poziționarea
 * anunțului. Pinul poate fi mutat prin drag sau prin click pe hartă.
 * Când locația nu este marcată ca exactă, harta afișează zona aproximativă
 * (cerc) în jurul poziției publicate, nu punctul real.
 */
import { useEffect, useRef, useState } from "react";
import type { Map as LeafletMap, Marker as LeafletMarker, Circle as LeafletCircle } from "leaflet";
import { APPROX_RADIUS_M, approximateCoords } from "@/lib/geo";

const DEFAULT_CENTER = { lat: 45.9432, lng: 24.9668 }; // centrul României

type Props = {
  lat: number | null;
  lng: number | null;
  precise: boolean;
  /** Seed pentru aproximare (id-ul proprietății sau un id temporar la creare). */
  seed: string;
  onChange?: (coords: { lat: number; lng: number }) => void;
  className?: string;
};

export function PropertyMap({ lat, lng, precise, seed, onChange, className }: Props) {
  const holder = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const markerRef = useRef<LeafletMarker | null>(null);
  const circleRef = useRef<LeafletCircle | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let map: LeafletMap | null = null;

    (async () => {
      const [{ default: L }] = await Promise.all([
        import("leaflet"),
        import("leaflet/dist/leaflet.css"),
      ]);
      if (cancelled || !holder.current || mapRef.current) return;

      map = L.map(holder.current, { scrollWheelZoom: false }).setView(
        [lat ?? DEFAULT_CENTER.lat, lng ?? DEFAULT_CENTER.lng],
        lat && lng ? 16 : 6,
      );
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      }).addTo(map);

      const icon = L.divIcon({
        className: "",
        html: '<div style="width:18px;height:18px;border-radius:9999px;background:hsl(var(--primary,222 47% 20%));border:3px solid white;box-shadow:0 1px 6px rgba(0,0,0,.4)"></div>',
        iconSize: [18, 18],
        iconAnchor: [9, 9],
      });

      const marker = L.marker([lat ?? DEFAULT_CENTER.lat, lng ?? DEFAULT_CENTER.lng], {
        draggable: Boolean(onChangeRef.current),
        icon,
        opacity: lat && lng ? 1 : 0.4,
      }).addTo(map);

      marker.on("dragend", () => {
        const pos = marker.getLatLng();
        onChangeRef.current?.({ lat: Number(pos.lat.toFixed(6)), lng: Number(pos.lng.toFixed(6)) });
      });
      map.on("click", (e) => {
        if (!onChangeRef.current) return;
        onChangeRef.current({
          lat: Number(e.latlng.lat.toFixed(6)),
          lng: Number(e.latlng.lng.toFixed(6)),
        });
      });

      mapRef.current = map;
      markerRef.current = marker;
      setReady(true);
    })();

    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
      markerRef.current = null;
      circleRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sincronizează pinul, zona aproximativă și centrarea la schimbarea valorilor.
  useEffect(() => {
    if (!ready) return;
    const map = mapRef.current;
    const marker = markerRef.current;
    if (!map || !marker) return;

    void (async () => {
      const { default: L } = await import("leaflet");
      const has = typeof lat === "number" && typeof lng === "number";
      const point = has ? { lat: lat as number, lng: lng as number } : DEFAULT_CENTER;

      marker.setLatLng([point.lat, point.lng]);
      marker.setOpacity(has ? 1 : 0.4);
      if (has) map.setView([point.lat, point.lng], Math.max(map.getZoom(), 15));

      circleRef.current?.remove();
      circleRef.current = null;
      if (has && !precise) {
        const approx = approximateCoords(point.lat, point.lng, seed);
        circleRef.current = L.circle([approx.lat, approx.lng], {
          radius: APPROX_RADIUS_M,
          color: "hsl(var(--primary, 222 47% 20%))",
          weight: 1,
          fillOpacity: 0.15,
        }).addTo(map);
      }
    })();
  }, [lat, lng, precise, seed, ready]);

  return (
    <div
      ref={holder}
      className={className ?? "h-72 w-full overflow-hidden rounded-lg border"}
      aria-label="Hartă poziționare proprietate"
    />
  );
}

export default PropertyMap;
