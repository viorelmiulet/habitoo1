import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2 } from "lucide-react";
import { toast } from "@/components/ui/sonner";
import { Button } from "@/components/ui/button";
import { SectionCard } from "@/components/app/SectionCard";
import { toastError } from "@/lib/errors";
import type { InventoryItem } from "@/lib/contracts/templates";
import { getContractInventoryDefaults, saveContractInventoryDefaults } from "@/lib/contracts.functions";
import { InventoryEditor } from "./InventoryEditor";

export function InventoryDefaultsCard() {
  const queryClient = useQueryClient();
  const fetchDefaults = useServerFn(getContractInventoryDefaults);
  const saveDefaults = useServerFn(saveContractInventoryDefaults);
  const [items, setItems] = useState<InventoryItem[]>([]);
  const query = useQuery({ queryKey: ["contract-inventory-defaults"], queryFn: () => fetchDefaults({}) });

  useEffect(() => {
    if (query.data) setItems(query.data.items);
  }, [query.data]);

  const save = useMutation({
    mutationFn: () => saveDefaults({ data: { items: items.filter((item) => item.name.trim()) } }),
    onSuccess: () => {
      toast.success("Inventarul implicit a fost salvat.");
      void queryClient.invalidateQueries({ queryKey: ["contract-inventory-defaults"] });
    },
    onError: (error: Error) => toastError(error),
  });

  return (
    <SectionCard
      title="Inventar implicit pentru contracte"
      description="Această listă precompletează anexele noi. Contractele existente nu se modifică."
      action={<Button size="sm" onClick={() => save.mutate()} disabled={save.isPending}>{save.isPending ? <Loader2 className="size-4 animate-spin" /> : null} Salvează lista</Button>}
    >
      {query.isLoading ? <p className="text-sm text-muted-foreground">Se încarcă lista…</p> : <InventoryEditor items={items} onChange={setItems} />}
    </SectionCard>
  );
}