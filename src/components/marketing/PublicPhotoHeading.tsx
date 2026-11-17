import type { ReactNode } from "react";
import { useLocation } from "@tanstack/react-router";
import type { PublicPagePhoto } from "./public-page-photos";

/** PageHero: text la stânga, fotografia existentă într-un cadru ds-panel cu ton închis. */
export function PublicPhotoHeading({ photo, children, chip }: { photo: PublicPagePhoto; children: ReactNode; chip?: string }) {
  const { pathname } = useLocation();
  const label = chip ?? `// habitoo.ro${pathname.replace(/\/$/, "")}`;
  return (
    <div data-public-photo-heading className="grid items-center gap-8 lg:grid-cols-2 lg:gap-12">
      <div className="min-w-0">{children}</div>
      <figure className="ds-panel ds-photo-frame relative m-0 overflow-hidden">
        <img
          data-public-page-photo
          src={photo.src}
          alt={photo.alt}
          width={1200}
          height={800}
          loading="eager"
          fetchPriority="high"
          decoding="async"
          className="aspect-[3/2] h-auto w-full object-cover"
        />
        <span aria-hidden className="ds-photo-overlay pointer-events-none absolute inset-0" />
        <span aria-hidden className="ds-chip absolute bottom-4 left-4">{label}</span>
      </figure>
    </div>
  );
}
