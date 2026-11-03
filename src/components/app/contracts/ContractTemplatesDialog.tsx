import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Copy, RotateCcw, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { deleteTemplate, listTemplates, saveTemplate } from "@/lib/contracts.functions";
import { GDPR_NOTICE_KIND } from "@/lib/contracts/gdpr-notice";
import { TEMPLATE_VARIABLES, renderTemplate, unknownVariables, type ContractKind } from "@/lib/contracts/templates";
import { toast } from "@/components/ui/sonner";
import { toastError } from "@/lib/errors";
import { ContractBodyPreview } from "./ContractBodyPreview";

export function ContractTemplatesDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (value: boolean) => void }) {
  const fetch = useServerFn(listTemplates);
  const save = useServerFn(saveTemplate);
  const remove = useServerFn(deleteTemplate);
  const queryClient = useQueryClient();
  const templates = useQuery({ queryKey: ["contract-templates"], queryFn: () => fetch(), enabled: open });
  const [selected, setSelected] = useState("");
  const [name, setName] = useState("");
  const [body, setBody] = useState("");
  const item = templates.data?.find((t) => t.id === selected);
  const unknown = unknownVariables(body);
  const mutation = useMutation({
    mutationFn: () => {
      if (!item) throw new Error("Alege șablonul.");
      return save({ data: { ...(item.isPlatform ? { copyOf: item.id } : { id: item.id }), kind: item.kind as ContractKind | typeof GDPR_NOTICE_KIND, name, body } });
    },
    onSuccess: async ({ id }) => {
      await queryClient.invalidateQueries({ queryKey: ["contract-templates"] });
      setSelected(id); toast.success("Șablonul agenției a fost salvat.");
    },
    onError: (error: Error) => toastError(error),
  });
  // C7: removing the agency copy of the GDPR notice makes the Habitoo standard text apply again.
  const revert = useMutation({
    mutationFn: async () => {
      if (!item || item.isPlatform) throw new Error("Alege șablonul agenției.");
      await remove({ data: { id: item.id } });
      return templates.data?.find((t) => t.isPlatform && t.kind === GDPR_NOTICE_KIND) ?? null;
    },
    onSuccess: async (standard) => {
      await queryClient.invalidateQueries({ queryKey: ["contract-templates"] });
      setSelected(standard?.id ?? ""); setName(standard?.name ?? ""); setBody(standard?.body ?? "");
      toast.success("Nota folosește din nou textul standard Habitoo.");
    },
    onError: (error: Error) => toastError(error),
  });
  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="max-h-[calc(100dvh-2rem)] max-w-5xl overflow-y-auto">
      <DialogHeader><DialogTitle>Șabloane contracte</DialogTitle></DialogHeader>
      <Select value={selected} onValueChange={(id) => {
        const t = templates.data?.find((value) => value.id === id);
        setSelected(id); setName(t?.name ?? ""); setBody(t?.body ?? "");
      }}>
        <SelectTrigger aria-label="Șablon contract"><SelectValue placeholder="Alege șablonul" /></SelectTrigger>
        <SelectContent>{templates.data?.map((t) => <SelectItem key={t.id} value={t.id}>{t.kind === GDPR_NOTICE_KIND && !t.isPlatform ? "Notă de informare GDPR" : t.name}{t.isPlatform ? " · Habitoo" : " · Agenție"}</SelectItem>)}</SelectContent>
      </Select>
      {templates.isError ? <p role="alert" className="text-sm text-destructive">Șabloanele nu au putut fi citite.</p> : null}
      {item ? <>
        <div className="grid min-w-0 gap-5 lg:grid-cols-2">
          <div className="min-w-0 space-y-3">
            <Label htmlFor="contract-template-name">Denumire</Label><Input id="contract-template-name" value={name} onChange={(e) => setName(e.target.value)} />
            <Label htmlFor="contract-template-body">Text șablon</Label><Textarea id="contract-template-body" className="min-h-[360px] font-mono text-xs" value={body} onChange={(e) => setBody(e.target.value)} />
            <Select value="" onValueChange={(key) => setBody((current) => `${current}{{${key}}}`)}>
              <SelectTrigger aria-label="Inserează câmp"><SelectValue placeholder="Inserează câmp" /></SelectTrigger>
              <SelectContent>{TEMPLATE_VARIABLES.flatMap((g) => g.items.map((v) => <SelectItem key={v.key} value={v.key}>{g.group} · {v.label}</SelectItem>))}</SelectContent>
            </Select>
          </div>
          <div className="min-w-0 space-y-3"><h3 className="text-sm font-semibold">Previzualizare</h3><ContractBodyPreview body={renderTemplate(body,{})} /></div>
        </div>
        {unknown.length ? <p role="alert" className="text-sm text-destructive">Câmpuri necunoscute: {unknown.join(", ")}</p> : null}
        <div className="flex flex-wrap gap-2"><Button disabled={mutation.isPending || unknown.length > 0} onClick={() => mutation.mutate()}>
          {item.isPlatform ? <Copy className="size-4" /> : <Save className="size-4" />}{item.isPlatform ? "Salvează copia agenției" : "Salvează șablonul"}
        </Button>
        {item.kind === GDPR_NOTICE_KIND && !item.isPlatform ? (
          <Button variant="outline" disabled={revert.isPending} onClick={() => revert.mutate()}>
            <RotateCcw className="size-4" />Revino la textul standard
          </Button>
        ) : null}</div>
      </> : null}
    </DialogContent>
  </Dialog>;
}