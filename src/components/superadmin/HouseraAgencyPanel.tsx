import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { PlugZap, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getHouseraAgencyStatus, saveHouseraSandboxKey, testHouseraConnection } from "@/lib/portals/housera.functions";
import { HOUSERA_MISSING_MESSAGE } from "@/lib/portals/housera/config";

export function HouseraAgencyPanel({ organizationId }: { organizationId: string }) {
  const qc = useQueryClient();
  const load = useServerFn(getHouseraAgencyStatus);
  const save = useServerFn(saveHouseraSandboxKey);
  const test = useServerFn(testHouseraConnection);
  const [key, setKey] = useState("");
  const qk = ["housera-agency", organizationId];
  const status = useQuery({ queryKey: qk, queryFn: () => load({ data: { organizationId } }) });
  const saveM = useMutation({
    mutationFn: () => save({ data: { organizationId, key } }),
    onSuccess: () => { setKey(""); toast.success("Cheia Housera a fost salvată."); void qc.invalidateQueries({ queryKey: qk }); },
    onError: (e: Error) => toast.error(e.message),
  });
  const testM = useMutation({
    mutationFn: () => test({ data: { organizationId } }),
    onSuccess: (r) => { (r.ok ? toast.success : toast.error)(r.message); void qc.invalidateQueries({ queryKey: qk }); },
    onError: (e: Error) => toast.error(e.message),
  });
  const s = status.data;
  if (!s) return null;
  return (
    <div className="w-full space-y-3 rounded-[14px] border border-border bg-card p-4 sm:p-5">
      {!s.configured ? <p className="rounded-xl bg-gold-tint p-3 text-sm">{HOUSERA_MISSING_MESSAGE}</p> : null}
      {s.reconnectRequired && s.lastError ? <p role="alert" className="rounded-xl bg-danger-tint p-3 text-sm text-destructive">{s.lastError}</p> : null}
      {s.env === "staging" ? (
        <div className="space-y-2">
          <Label htmlFor="housera-sandbox-key">Cheie de conexiune (sandbox)</Label>
          <p className="text-[13px] text-muted-foreground">Salvată: {s.keyMask ?? "—"}</p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input id="housera-sandbox-key" type="password" autoComplete="off" value={key} onChange={(e) => setKey(e.target.value)} placeholder="<număr>|hsr_test_…" />
            <Button type="button" className="w-full sm:w-auto" disabled={!key.trim() || saveM.isPending} onClick={() => saveM.mutate()}>
              <Save className="mr-2 size-4" />Salvează
            </Button>
          </div>
        </div>
      ) : null}
      <Button type="button" variant="outline" className="w-full sm:w-auto" disabled={testM.isPending} onClick={() => testM.mutate()}>
        <PlugZap className="mr-2 size-4" />Testează conexiunea
      </Button>
    </div>
  );
}
