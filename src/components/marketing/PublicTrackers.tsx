import { useEffect, useState } from "react";
import { isPublicHostname } from "@/lib/host";
import { GoogleAdsTag } from "./GoogleAdsTag";
import { PlausibleAnalytics } from "./PlausibleAnalytics";

/**
 * Montare unică (în rădăcină) a etichetelor de analiză/reclame, doar pe
 * domeniile publice. Fiecare etichetă își verifică separat consimțământul.
 */
export function PublicTrackers() {
  const [isPublic, setIsPublic] = useState(false);
  useEffect(() => setIsPublic(isPublicHostname(window.location.hostname)), []);
  if (!isPublic) return null;
  return (
    <>
      <PlausibleAnalytics />
      <GoogleAdsTag />
    </>
  );
}
