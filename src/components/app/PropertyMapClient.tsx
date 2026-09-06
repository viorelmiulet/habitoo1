/**
 * Wrapper client-only pentru harta Leaflet: modulul `leaflet` atinge `window`
 * la import, deci se încarcă doar după hidratare.
 */
import { lazy, Suspense } from "react";
import { ClientOnly } from "@tanstack/react-router";

const PropertyMap = lazy(() => import("@/components/app/PropertyMap"));

type Props = {
  lat: number | null;
  lng: number | null;
  precise: boolean;
  seed: string;
  onChange?: (coords: { lat: number; lng: number }) => void;
  className?: string;
};

export function PropertyMapClient(props: Props) {
  const skeleton = (
    <div className={props.className ?? "h-72 w-full rounded-lg border"}>
      <div className="h-full w-full animate-pulse rounded-lg bg-muted" />
    </div>
  );
  return (
    <ClientOnly fallback={skeleton}>
      <Suspense fallback={skeleton}>
        <PropertyMap {...props} />
      </Suspense>
    </ClientOnly>
  );
}
