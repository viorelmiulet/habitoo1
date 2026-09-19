/**
 * Superadmin: completarea în serie a codurilor poștale lipsă.
 *
 * Acțiune manuală, pe loturi mici, cu ritmul impus de furnizorul de adrese
 * (OpenStreetMap / Nominatim: o cerere pe secundă). Nu rulează automat.
 */
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { MapPin } from "lucide-react";
import { SectionCard } from "@/components/app/SectionCard";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/components/ui/sonner";
import { toastError } from "@/lib/errors";
import {
  backfillPostalCodes,
  type PostalCodeReport,
} from "@/lib/geo/postal-code.functions";

const SOURCE_LABEL: Record<string, string> = {
  manual: "introdus manual",
  geocoded: "exact (nivel stradă)",
  approximate: "aproximativ (nivel localitate)",
};

export function PostalCodeBackfillCard() {
  const runBackfill = useServerFn(backfillPostalCodes);

  const backfill = useMutation({
    mutationFn: () => runBackfill({ data: { limit: 25 } }),
    onSuccess: (result) => {
      toast.success(
        result.processed === 0
          ? "Nu mai există oferte fără cod poștal."
          : `Am verificat ${result.processed} oferte.`,
      );
    },
    onError: (error) => toastError(error),
  });

  const items: PostalCodeReport[] = backfill.data?.items ?? [];

  return (
    <SectionCard
      title="Coduri poștale lipsă"
      description="Completează codul poștal din adresa ofertei, în loturi de 25. Un cod introdus manual nu este niciodată înlocuit."
      action={
        <Button
          size="sm"
          variant="outline"
          onClick={() => backfill.mutate()}
          disabled={backfill.isPending}
        >
          <MapPin className="mr-2 h-4 w-4" />
          {backfill.isPending ? "Se completează…" : "Completează un lot"}
        </Button>
      }
    >
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Rulează manual un lot pentru a vedea ce s-a găsit pentru fiecare ofertă.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="py-2 pr-4">Ofertă</th>
                <th className="py-2 pr-4">Cod poștal</th>
                <th className="py-2 pr-4">Sursă</th>
                <th className="py-2">Motiv</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.propertyId} className="border-t border-border">
                  <td className="py-2 pr-4">
                    <span className="font-medium">{item.reference ?? "—"}</span>{" "}
                    <span className="text-muted-foreground">{item.title ?? ""}</span>
                  </td>
                  <td className="py-2 pr-4">
                    {item.postalCode ? (
                      item.postalCode
                    ) : (
                      <Badge variant="outline">necompletat</Badge>
                    )}
                  </td>
                  <td className="py-2 pr-4">
                    {item.source ? (SOURCE_LABEL[item.source] ?? item.source) : "—"}
                  </td>
                  <td className="py-2 text-muted-foreground">{item.reasonLabel}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </SectionCard>
  );
}
