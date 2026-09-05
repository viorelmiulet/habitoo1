import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Download, Search, UserRound } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/app/PageHeader";
import { StatusBadge } from "@/components/app/StatusBadge";
import { EmptyState } from "@/components/app/EmptyState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser } from "@/hooks/use-session";
import { relativeDays } from "@/lib/format";
import { contactTypeLabels } from "@/lib/labels";

export const Route = createFileRoute("/_authenticated/app/contacts/")({
  validateSearch: (search: Record<string, unknown>) => ({
    new: search.new === true || search.new === "true" ? true : undefined,
  }),
  component: ContactsPage,
});

function ContactsPage() {
  const { new: openNew } = Route.useSearch();
  const { data: user } = useCurrentUser();
  const queryClient = useQueryClient();
  const [q, setQ] = useState("");
  const [type, setType] = useState("all");
  const [dialogOpen, setDialogOpen] = useState(Boolean(openNew));

  const { data: contacts = [], isLoading } = useQuery({
    queryKey: ["contacts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contacts")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const [form, setForm] = useState({
    first_name: "",
    last_name: "",
    type: "buyer",
    phone: "",
    email: "",
    company: "",
    source: "",
    notes: "",
  });

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
        company: form.company || null,
        source: form.source || null,
        notes: form.notes || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["contacts"] });
      setDialogOpen(false);
      setForm({
        first_name: "",
        last_name: "",
        type: "buyer",
        phone: "",
        email: "",
        company: "",
        source: "",
        notes: "",
      });
      toast.success("Contactul a fost adăugat.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const rows = useMemo(() => {
    const term = q.trim().toLowerCase();
    return contacts.filter((c) => {
      if (type !== "all" && c.type !== type) return false;
      if (!term) return true;
      return [c.first_name, c.last_name, c.phone, c.email, c.company]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(term));
    });
  }, [contacts, q, type]);

  const exportCsv = () => {
    const lines = rows.map((c) =>
      [c.first_name, c.last_name, contactTypeLabels[c.type] ?? c.type, c.phone ?? "", c.email ?? ""]
        .map((v) => `"${String(v).replaceAll('"', '""')}"`)
        .join(","),
    );
    const blob = new Blob([["Prenume,Nume,Tip,Telefon,Email", ...lines].join("\n")], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "contacte.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <>
      <PageHeader
        title="Contacte"
        description="Toți clienții, proprietarii și partenerii agenției, într-o singură bază."
        actions={
          <>
            <Button variant="outline" size="sm" onClick={exportCsv}>
              <Download className="size-4" /> Export CSV
            </Button>
            <Button size="sm" onClick={() => setDialogOpen(true)}>
              Adaugă contact
            </Button>
          </>
        }
      />

      <div className="panel flex flex-wrap items-center gap-2 p-4">
        <div className="relative min-w-56 flex-1">
          <Search className="pointer-events-none absolute top-2.5 left-3 size-4 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Caută nume, telefon, email…"
            className="pl-9"
          />
        </div>
        <Select value={type} onValueChange={setType}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="Tip contact" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Toate tipurile</SelectItem>
            {Object.entries(contactTypeLabels).map(([k, v]) => (
              <SelectItem key={k} value={k}>
                {v}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="panel overflow-hidden">
        {isLoading ? (
          <p className="px-4 py-10 text-center text-sm text-muted-foreground">Se încarcă…</p>
        ) : rows.length === 0 ? (
          <EmptyState
            icon={UserRound}
            title="Niciun contact"
            description="Adaugă primul contact sau ajustează filtrele."
            action={
              <Button size="sm" onClick={() => setDialogOpen(true)}>
                Adaugă contact
              </Button>
            }
          />
        ) : (
          <ul className="divide-y divide-border">
            {rows.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
                <div className="min-w-0 flex-1">
                  <Link
                    to="/app/contacts/$id"
                    params={{ id: c.id }}
                    className="truncate font-medium hover:text-primary"
                  >
                    {c.first_name} {c.last_name}
                  </Link>
                  <p className="truncate text-xs text-muted-foreground">
                    {c.company || c.source || "—"}
                  </p>
                </div>
                <StatusBadge tone="primary">{contactTypeLabels[c.type] ?? c.type}</StatusBadge>
                <span className="w-36 text-xs text-muted-foreground">{c.phone ?? "—"}</span>
                <span className="w-52 truncate text-xs text-muted-foreground">{c.email ?? "—"}</span>
                <span className="w-24 text-right text-xs text-muted-foreground">
                  {relativeDays(c.created_at)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Contact nou</DialogTitle>
            <DialogDescription>Datele minime necesare; restul se pot completa ulterior.</DialogDescription>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              create.mutate();
            }}
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="first_name">Prenume</Label>
                <Input
                  id="first_name"
                  required
                  value={form.first_name}
                  onChange={(e) => setForm((f) => ({ ...f, first_name: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="last_name">Nume</Label>
                <Input
                  id="last_name"
                  required
                  value={form.last_name}
                  onChange={(e) => setForm((f) => ({ ...f, last_name: e.target.value }))}
                />
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
              <div className="space-y-2">
                <Label htmlFor="phone">Telefon</Label>
                <Input
                  id="phone"
                  value={form.phone}
                  onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="company">Companie</Label>
                <Input
                  id="company"
                  value={form.company}
                  onChange={(e) => setForm((f) => ({ ...f, company: e.target.value }))}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="notes">Note</Label>
              <Textarea
                id="notes"
                rows={3}
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                Renunță
              </Button>
              <Button type="submit" disabled={create.isPending}>
                Salvează
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
