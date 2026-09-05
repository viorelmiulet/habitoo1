import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { activityKindLabels } from "@/lib/labels";
import { activityStatusLabels } from "@/lib/crm";

type ActivityKind = keyof typeof activityKindLabels;

export function ActivityDialog({
  open,
  onOpenChange,
  orgId,
  userId,
  defaults,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orgId: string | null | undefined;
  userId: string | undefined;
  defaults?: {
    kind?: ActivityKind;
    title?: string;
    propertyId?: string;
    contactId?: string;
    leadId?: string;
    requestId?: string;
    startsAt?: Date;
  };
  onCreated?: () => void;
}) {
  const queryClient = useQueryClient();

  const now = new Date();
  const [kind, setKind] = useState<ActivityKind>(defaults?.kind ?? "call");
  const [title, setTitle] = useState(defaults?.title ?? "");
  const [description, setDescription] = useState("");
  const [date, setDate] = useState(() => (defaults?.startsAt ?? now).toISOString().slice(0, 10));
  const [time, setTime] = useState(() => (defaults?.startsAt ?? now).toISOString().slice(11, 16));
  const [duration, setDuration] = useState("30");
  const [assignedTo, setAssignedTo] = useState<string>(userId ?? "");
  const [status, setStatus] = useState<"planned" | "done" | "cancelled">("planned");

  useEffect(() => {
    if (open) {
      setKind(defaults?.kind ?? "call");
      setTitle(defaults?.title ?? "");
      setDescription("");
      const base = defaults?.startsAt ?? new Date();
      setDate(base.toISOString().slice(0, 10));
      setTime(base.toISOString().slice(11, 16));
      setDuration("30");
      setAssignedTo(userId ?? "");
      setStatus("planned");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const { data: agents = [] } = useQuery({
    queryKey: ["profiles", "org", orgId],
    enabled: Boolean(orgId) && open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id,full_name")
        .eq("organization_id", orgId as string)
        .order("full_name");
      if (error) throw error;
      return data;
    },
  });

  const create = useMutation({
    mutationFn: async () => {
      if (!orgId) throw new Error("Agenția nu este configurată.");
      if (!title.trim()) throw new Error("Titlul este obligatoriu.");
      const startsAt = new Date(`${date}T${time || "00:00"}:00`);
      const endsAt = new Date(startsAt.getTime() + Number(duration || 0) * 60_000);
      const { error } = await supabase.from("activities").insert({
        organization_id: orgId,
        created_by: userId ?? null,
        assigned_to: assignedTo || null,
        kind: kind as never,
        title: title.trim(),
        description: description || null,
        starts_at: startsAt.toISOString(),
        ends_at: endsAt.toISOString(),
        duration_minutes: Number(duration || 0),
        status: status as never,
        done: status === "done",
        property_id: defaults?.propertyId ?? null,
        contact_id: defaults?.contactId ?? null,
        lead_id: defaults?.leadId ?? null,
        request_id: defaults?.requestId ?? null,
      } as never);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Activitate creată.");
      queryClient.invalidateQueries({ queryKey: ["activities"] });
      onOpenChange(false);
      onCreated?.();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Activitate nouă</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Tip</Label>
              <Select value={kind} onValueChange={(v) => setKind(v as ActivityKind)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(activityKindLabels).map(([k, v]) => (
                    <SelectItem key={k} value={k}>
                      {v}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Status</Label>
              <Select value={status} onValueChange={(v) => setStatus(v as typeof status)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(activityStatusLabels).map(([k, v]) => (
                    <SelectItem key={k} value={k}>
                      {v}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="activity-title">Titlu</Label>
            <Input id="activity-title" value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="activity-desc">Descriere</Label>
            <Textarea id="activity-desc" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="activity-date">Dată</Label>
              <Input id="activity-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="activity-time">Oră</Label>
              <Input id="activity-time" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="activity-duration">Durată (min)</Label>
              <Input
                id="activity-duration"
                type="number"
                min="0"
                value={duration}
                onChange={(e) => setDuration(e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Responsabil</Label>
            <Select value={assignedTo} onValueChange={setAssignedTo}>
              <SelectTrigger>
                <SelectValue placeholder="Selectează agent" />
              </SelectTrigger>
              <SelectContent>
                {agents.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.full_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Anulează
          </Button>
          <Button onClick={() => create.mutate()} disabled={create.isPending}>
            {create.isPending ? "Se salvează…" : "Salvează activitatea"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
