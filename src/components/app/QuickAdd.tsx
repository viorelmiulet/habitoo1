import { useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Building2, CalendarPlus, Eye, Flame, Plus, Target, UserRound } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetFooter,
} from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser } from "@/hooks/use-session";
import { contactTypeLabels } from "@/lib/labels";
import { ActivityDialog } from "@/components/app/ActivityDialog";

function ContactSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const { data: user } = useCurrentUser();
  const queryClient = useQueryClient();
  const [form, setForm] = useState({ first_name: "", last_name: "", type: "buyer", phone: "", email: "" });

  const create = useMutation({
    mutationFn: async () => {
      if (!user?.organization?.id) throw new Error("Agenția nu este configurată.");
      const { error } = await supabase.from("contacts").insert({
        organization_id: user.organization.id,
        assigned_to: user.userId,
        created_by: user.userId,
        first_name: form.first_name,
        last_name: form.last_name,
        type: form.type as never,
        phone: form.phone || null,
        email: form.email || null,
      } as never);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["contacts"] });
      onOpenChange(false);
      setForm({ first_name: "", last_name: "", type: "buyer", phone: "", email: "" });
      toast.success("Contactul a fost adăugat.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Contact nou</SheetTitle>
        </SheetHeader>
        <div className="space-y-4 px-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Prenume</Label>
              <Input value={form.first_name} onChange={(e) => setForm((f) => ({ ...f, first_name: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Nume</Label>
              <Input value={form.last_name} onChange={(e) => setForm((f) => ({ ...f, last_name: e.target.value }))} />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Tip</Label>
            <Select value={form.type} onValueChange={(v) => setForm((f) => ({ ...f, type: v }))}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(contactTypeLabels).map(([k, v]) => (
                  <SelectItem key={k} value={k}>
                    {v}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Telefon</Label>
              <Input value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Email</Label>
              <Input value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
            </div>
          </div>
        </div>
        <SheetFooter>
          <Button
            disabled={!form.first_name.trim() || create.isPending}
            onClick={() => create.mutate()}
          >
            {create.isPending ? "Se salvează…" : "Salvează contactul"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

function LeadSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const { data: user } = useCurrentUser();
  const queryClient = useQueryClient();
  const [form, setForm] = useState({ name: "", phone: "", email: "", source: "" });

  const create = useMutation({
    mutationFn: async () => {
      if (!user?.organization?.id) throw new Error("Agenția nu este configurată.");
      if (!form.name.trim()) throw new Error("Numele este obligatoriu.");
      const { error } = await supabase.from("leads").insert({
        organization_id: user.organization.id,
        assigned_to: user.userId,
        created_by: user.userId,
        name: form.name.trim(),
        phone: form.phone || null,
        email: form.email || null,
        source: form.source || null,
        stage: "new" as never,
      } as never);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["leads"] });
      onOpenChange(false);
      setForm({ name: "", phone: "", email: "", source: "" });
      toast.success("Lead-ul a fost adăugat.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Lead nou</SheetTitle>
        </SheetHeader>
        <div className="space-y-4 px-4">
          <div className="space-y-2">
            <Label>Nume</Label>
            <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Telefon</Label>
              <Input value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Email</Label>
              <Input value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Sursă</Label>
            <Input value={form.source} onChange={(e) => setForm((f) => ({ ...f, source: e.target.value }))} />
          </div>
        </div>
        <SheetFooter>
          <Button disabled={!form.name.trim() || create.isPending} onClick={() => create.mutate()}>
            {create.isPending ? "Se salvează…" : "Salvează lead-ul"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

export function QuickAdd() {
  const { data: user } = useCurrentUser();
  const navigate = useNavigate();
  const [contactOpen, setContactOpen] = useState(false);
  const [leadOpen, setLeadOpen] = useState(false);
  const [activityOpen, setActivityOpen] = useState(false);
  const [viewingOpen, setViewingOpen] = useState(false);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="sm" className="gap-1.5">
            <Plus className="size-4" />
            <span className="hidden sm:inline">Adaugă</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel>Adăugare rapidă</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild>
            <Link to="/app/properties/new">
              <Building2 className="size-4" /> Proprietate
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setContactOpen(true)}>
            <UserRound className="size-4" /> Contact
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setLeadOpen(true)}>
            <Flame className="size-4" /> Lead
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => navigate({ to: "/app/requests", search: { new: true } })}>
            <Target className="size-4" /> Cerere
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setActivityOpen(true)}>
            <CalendarPlus className="size-4" /> Activitate
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setViewingOpen(true)}>
            <Eye className="size-4" /> Vizionare
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <ContactSheet open={contactOpen} onOpenChange={setContactOpen} />
      <LeadSheet open={leadOpen} onOpenChange={setLeadOpen} />
      <ActivityDialog
        open={activityOpen}
        onOpenChange={setActivityOpen}
        orgId={user?.organization?.id}
        userId={user?.userId}
      />
      <ActivityDialog
        open={viewingOpen}
        onOpenChange={setViewingOpen}
        orgId={user?.organization?.id}
        userId={user?.userId}
        defaults={{ kind: "viewing", title: "Vizionare" }}
      />
    </>
  );
}
