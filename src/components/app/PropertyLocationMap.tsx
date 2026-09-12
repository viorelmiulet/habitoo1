/**
 * Blocul de poziționare pe hartă folosit la crearea și editarea unei proprietăți:
 * hartă interactivă OpenStreetMap, buton de geocodare din adresă și comutatorul
 * de precizie (zonă estimativă vs. locație exactă).
 */
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { MapPin, Loader2 } from "lucide-react";
import { toast } from "@/components/ui/sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { geocodeAddress } from "@/lib/geocode.functions";
import { APPROX_RADIUS_M } from "@/lib/geo";
import { PropertyMapClient } from "@/components/app/PropertyMapClient";

type Props = {
  idPrefix?: string;
  seed: string;
  lat: number | null;
  lng: number | null;
  precise: boolean;
  /** Părți de adresă pentru geocodare: stradă/adresă, cartier, oraș, județ. */
  addressParts: (string | null | undefined)[];
  onCoordsChange: (coords: { lat: number; lng: number }) => void;
  onPreciseChange: (precise: boolean) => void;
};

export function PropertyLocationMap({
  idPrefix = "map",
  seed,
  lat,
  lng,
  precise,
  addressParts,
  onCoordsChange,
  onPreciseChange,
}: Props) {
  const geocode = useServerFn(geocodeAddress);
  const [pending, setPending] = useState(false);

  const query = addressParts
    .map((p) => (p ?? "").trim())
    .filter(Boolean)
    .join(", ");

  const locate = async () => {
    if (query.length < 3) {
      toast.info("Completează adresa, orașul sau județul înainte de localizare.");
      return;
    }
    setPending(true);
    try {
      const result = await geocode({ data: { query: `${query}, România` } });
      if (result.ok && typeof result.lat === "number" && typeof result.lng === "number") {
        onCoordsChange({ lat: result.lat, lng: result.lng });
        toast.success("Pin mutat la adresa găsită. Îl poți ajusta manual.");
      } else {
        toast.info(
          result.message ?? "Adresa nu a fost găsită. Poziționează pinul manual pe hartă.",
        );
      }
    } catch {
      toast.info("Geocodarea nu a răspuns. Poziționează pinul manual pe hartă.");
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="space-y-3 rounded-lg border p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1">
          <p className="text-sm font-medium">Poziția pe hartă</p>
          <p className="text-xs text-muted-foreground">
            Trage pinul sau dă click pe hartă pentru poziționare exactă.
            {typeof lat === "number" && typeof lng === "number"
              ? ` Coordonate: ${lat.toFixed(5)}, ${lng.toFixed(5)}.`
              : " Încă nu ai setat coordonate."}
          </p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={locate} disabled={pending}>
          {pending ? <Loader2 className="size-4 animate-spin" /> : <MapPin className="size-4" />}
          Localizează pe hartă
        </Button>
      </div>

      <PropertyMapClient
        lat={lat}
        lng={lng}
        precise={precise}
        seed={seed}
        onChange={onCoordsChange}
      />

      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <Label htmlFor={`${idPrefix}-location-precise`} className="text-sm">
            Locație exactă
          </Label>
          <p className="text-xs text-muted-foreground">
            {precise
              ? "Se publică poziția exactă a proprietății, pe site și în portaluri."
              : `Implicit: hartă estimativă — public se arată o zonă de aproximativ ${APPROX_RADIUS_M} m, nu adresa exactă.`}
          </p>
        </div>
        <Switch
          id={`${idPrefix}-location-precise`}
          checked={precise}
          onCheckedChange={onPreciseChange}
        />
      </div>
    </div>
  );
}
