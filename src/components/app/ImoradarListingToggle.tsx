/** Fila Publicare: bifa imoradar24 pentru anunț, când Imobiliare.ro e bifat și setarea agenției e activă. */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { Checkbox } from "@/components/ui/checkbox";
import { getImoradarPreference, setImoradarOptOut } from "@/lib/portals/imoradar.functions";

export function ImoradarListingToggle({
  propertyId,
  organizationId,
  disabled,
}: {
  propertyId: string;
  organizationId?: string;
  disabled?: boolean;
}) {
  const queryClient = useQueryClient();
  const load = useServerFn(getImoradarPreference);
  const save = useServerFn(setImoradarOptOut);
  const key = ["imoradar-preference", propertyId, organizationId ?? null] as const;
  const input = { propertyId, ...(organizationId ? { organizationId } : {}) };
  const pref = useQuery({ queryKey: key, queryFn: () => load({ data: input }) });
  const mutation = useMutation({
    mutationFn: (checked: boolean) => save({ data: { ...input, optOut: !checked } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: key }),
  });
  if (!pref.data?.settingOn) return null;
  const checked = mutation.isPending ? mutation.variables === true : pref.data.checked;
  return (
    <label className="relative z-10 inline-flex items-center gap-2 text-xs">
      <Checkbox
        checked={checked}
        disabled={disabled || mutation.isPending}
        aria-label="Trimite și pe imoradar24"
        onCheckedChange={(next) => mutation.mutate(next === true)}
      />
      Trimite și pe imoradar24
    </label>
  );
}
