import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { saveActiveMatchThreshold } from "@/lib/active-matching/active-matching.functions";
import { ACTIVE_MATCH_DEFAULT_THRESHOLD } from "@/lib/active-matching/plan";

export function ActiveMatchThresholdCard() {
  const qc = useQueryClient();
  const save = useServerFn(saveActiveMatchThreshold);
  const { data } = useQuery({
    queryKey: ["active-match-settings"],
    queryFn: async () => {
      const { data } = await supabase.from("active_match_settings").select("min_score").maybeSingle();
      return data?.min_score ?? ACTIVE_MATCH_DEFAULT_THRESHOLD;
    },
  });
  const [value, setValue] = useState(String(ACTIVE_MATCH_DEFAULT_THRESHOLD));
  useEffect(() => { if (data != null) setValue(String(data)); }, [data]);
  const m = useMutation({
    mutationFn: () => save({ data: { minScore: Number(value) } }),
    onSuccess: (r) => { if (r.ok) { toast.success("Pragul a fost salvat."); qc.invalidateQueries({ queryKey: ["active-match-settings"] }); } else toast.error(r.message ?? "Eroare"); },
  });
  const n = Number(value);
  const valid = Number.isInteger(n) && n >= 50 && n <= 100;
  return (
    <div className="rounded-xl border bg-card p-5">
      <h3 className="font-semibold">Potriviri active</h3>
      <p className="mt-1 text-sm text-muted-foreground">Agenții sunt anunțați când o proprietate nouă sau mai ieftină se potrivește cu o cerere activă peste acest scor. Detectarea e gratuită; doar ciorna AI a mesajului consumă credite.</p>
      <div className="mt-3 flex items-end gap-2">
        <div>
          <Label htmlFor="am-threshold">Scor minim (50–100)</Label>
          <Input id="am-threshold" type="number" min={50} max={100} className="w-28" value={value} onChange={(e) => setValue(e.target.value)} />
        </div>
        <Button disabled={!valid || m.isPending} onClick={() => m.mutate()}>Salvează</Button>
      </div>
    </div>
  );
}
