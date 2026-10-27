import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useNavigate } from "@tanstack/react-router";
import { Check, Import, LoaderCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/app/ConfirmDialog";
import { useCurrentUser } from "@/hooks/use-session";
import { getPrivateListingImports, importPrivateListing } from "@/lib/private-listing-import.functions";
import { announceGuideContext } from '@/lib/onboarding-tour';

export function ImportListingButton({ listingId }: { listingId: string }) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const locked = useRef(false);
  const { data: user } = useCurrentUser();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const fetchImports = useServerFn(getPrivateListingImports);
  const importListing = useServerFn(importPrivateListing);
  const key = ["private-listing-imports", user?.userId];
  const imports = useQuery({ queryKey: key, queryFn: () => fetchImports(), enabled: Boolean(user?.userId) });
  const existingId = imports.data?.[listingId];
  const openProperty = (id: string) => navigate({ to: "/app/properties/$id", params: { id }, search: { edit: true } });
  const confirm = async () => {
    if (locked.current) return;
    locked.current = true;
    setPending(true);
    try {
      const result = await importListing({ data: { listingId, consent: true } });
      queryClient.setQueryData<Record<string, string>>(key, old => ({ ...old, [listingId]: result.propertyId }));
      await queryClient.invalidateQueries({ queryKey: ["properties"] });
      if (result.skipped) toast.warning(`${result.skipped} fotografii nu au putut fi copiate.`);
      await openProperty(result.propertyId);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Importul nu a putut fi finalizat.");
      throw error;
    } finally { locked.current = false; setPending(false); }
  };
  return <>
    <Button data-tour={existingId ? 'listing-imported' : 'listing-import-open'} type="button" variant="outline" className="min-h-10 h-auto whitespace-normal" disabled={pending || imports.isLoading || imports.isError || !user?.organization?.id}
      onClick={() => { if(existingId) void openProperty(existingId); else { setOpen(true); announceGuideContext('listing:import'); } }}>
      {pending ? <LoaderCircle className="size-4 animate-spin" /> : existingId ? <Check className="size-4" /> : <Import className="size-4" />}
      {pending ? "Se importă…" : existingId ? "Importat" : "Importă în portofoliu"}
    </Button>
    <ConfirmDialog open={open} onOpenChange={setOpen} title="Ai obținut acordul proprietarului?" confirmLabel="Da" cancelLabel="Nu" onConfirm={confirm} />
  </>;
}