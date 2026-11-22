import { useEffect, useState } from "react";
import { useRouterState } from "@tanstack/react-router";
import { isPublicHostname } from "@/lib/host";
import { adsAllowed } from "@/lib/google-ads";
import { GoogleAdsTag } from "./GoogleAdsTag";
import { PlausibleAnalytics } from "./PlausibleAnalytics";

/**
 * Montare unică (în rădăcină) a etichetelor de analiză/reclame, doar pe
 * domeniile publice (Google Ads și pe pagina de înscriere). Fiecare etichetă își verifică separat consimțământul.
 */
export function PublicTrackers() {
  const pathname = useRouterState({ select: (st) => st.location.pathname });
  const [isPublic, setIsPublic] = useState(false);
  const [adsHere, setAdsHere] = useState(false);
  useEffect(() => setIsPublic(isPublicHostname(window.location.hostname)), []);
  useEffect(() => setAdsHere(adsAllowed(window.location.hostname, pathname)), [pathname]);
  // Pe crm.habitoo.ro doar pagina de înscriere primește eticheta Google Ads (pentru conversie).
  if (!isPublic) return adsHere ? <GoogleAdsTag /> : null;
  return (
    <>
      <PlausibleAnalytics />
      <GoogleAdsTag />
    </>
  );
}
