import type { ReactNode } from "react";
import type { PublicPagePhoto } from "./public-page-photos";

export function PublicPhotoHeading({ photo, children }: { photo: PublicPagePhoto; children: ReactNode }) {
  return (
    <div data-public-photo-heading className="grid items-center gap-8 lg:grid-cols-2 lg:gap-12">
      <div className="min-w-0">{children}</div>
      <img
        data-public-page-photo
        src={photo.src}
        alt={photo.alt}
        width={1200}
        height={800}
        loading="eager"
        fetchPriority="high"
        decoding="async"
        className="aspect-[3/2] h-auto w-full rounded-lg object-cover"
      />
    </div>
  );
}