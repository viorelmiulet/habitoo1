import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Search, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/app/PageHeader";
import { ListSkeleton } from "@/components/app/LoadingState";
import { EmptyState } from "@/components/app/EmptyState";
import { ConfirmDialog } from "@/components/app/ConfirmDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "@/components/ui/sonner";
import { toastError } from "@/lib/errors";
import { supabase } from "@/integrations/supabase/client";
import { formatDateTime } from "@/lib/format";
import { leadStageLabels, propertyStatusLabels } from "@/lib/labels";
import { appHead } from "@/components/app/app-head";

export const Route = createFileRoute("/_authenticated/superadmin/deleted")({
  head: () => appHead("Habitoo CRM — elemente șterse"),
  component: DeletedItemsPage,
});

type DeletedRow = {
  id: string;
  reference: string | null;
  title: string;
  organization_id: string;
  deleted_at: string;
  deleted_by: string | null;
  pre_delete_status: string | null;
};

function DeletedItemsPage() {
  const [q, setQ] = useState("");
  const [target, setTarget] = useState<DeletedRow | null>(null);
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["superadmin", "deleted-properties"],
    queryFn: async () => {
      const { data: rows, error } = await supabase
        .from("properties")
        .select("id, reference, title, organization_id, deleted_at, deleted_by, pre_delete_status")
        .not("deleted_at", "is", null)
        .order("deleted_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      const list = (rows ?? []) as DeletedRow[];
      const orgIds = [...new Set(list.map((r) => r.organization_id))];
      const userIds = [...new Set(list.map((r) => r.deleted_by).filter(Boolean))] as string[];
      const [orgs, profiles] = await Promise.all([
        orgIds.length ? supabase.from("organizations").select("id,name").in("id", orgIds) : { data: [] },
        userIds.length ? supabase.from("profiles").select("id,full_name").in("id", userIds) : { data: [] },
      ]);
      return {
        rows: list,
        orgs: new Map((orgs.data ?? []).map((o) => [o.id, o.name as string])),
        people: new Map((profiles.data ?? []).map((p) => [p.id, (p.full_name as string | null) ?? "—"])),
      };
    },
  });

  const term = q.trim().toLowerCase();
  const rows = (data?.rows ?? []).filter((r) =>
    term
      ? `${r.reference ?? ""} ${data?.orgs.get(r.organization_id) ?? ""}`.toLowerCase().includes(term)
      : true,
  );

  return (
    <>
      <PageHeader title="Elemente șterse" description="Doar administratorul platformei poate restabili." />
      <Tabs defaultValue="properties">
        <TabsList>
          <TabsTrigger value="properties">Anunțuri</TabsTrigger>
          <TabsTrigger value="leads">Lead-uri</TabsTrigger>
        </TabsList>
        <TabsContent value="properties" className="panel p-4">
          <div className="relative mb-4 max-w-md">
            <Search className="pointer-events-none absolute top-2.5 left-3 size-4 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Caută după referință sau agenție…"
              aria-label="Caută după referință sau agenție"
              className="pl-9"
            />
          </div>
          {isLoading ? (
            <ListSkeleton rows={6} />
          ) : rows.length === 0 ? (
            <EmptyState icon={Trash2} title="Niciun anunț șters" description="Anunțurile șterse apar aici." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs text-muted-foreground uppercase">
                  <tr>
                    <th className="py-2 pr-3">Agenție</th>
                    <th className="py-2 pr-3">Referință</th>
                    <th className="py-2 pr-3">Titlu</th>
                    <th className="py-2 pr-3">Șters de</th>
                    <th className="py-2 pr-3">Când</th>
                    <th className="py-2 pr-3">Status anterior</th>
                    <th className="py-2" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {rows.map((r) => (
                    <tr key={r.id}>
                      <td className="py-2 pr-3">{data?.orgs.get(r.organization_id) ?? "—"}</td>
                      <td className="py-2 pr-3 font-mono">{r.reference ?? "—"}</td>
                      <td className="max-w-[280px] truncate py-2 pr-3">{r.title}</td>
                      <td className="py-2 pr-3">{r.deleted_by ? (data?.people.get(r.deleted_by) ?? "—") : "—"}</td>
                      <td className="py-2 pr-3">{formatDateTime(r.deleted_at)}</td>
                      <td className="py-2 pr-3">
                        {r.pre_delete_status ? (propertyStatusLabels[r.pre_delete_status] ?? r.pre_delete_status) : "—"}
                      </td>
                      <td className="py-2 text-right">
                        <Button variant="outline" size="sm" onClick={() => setTarget(r)}>
                          Restabilește
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </TabsContent>
        <TabsContent value="leads" className="panel p-4">
          <DeletedLeadsTab />
        </TabsContent>
      </Tabs>
      <ConfirmDialog
        open={target !== null}
        onOpenChange={(o) => !o && setTarget(null)}
        title={`Restabilești anunțul ${target?.reference ?? ""}?`}
        description="Anunțul revine la statusul de dinainte, dar NU se republică automat pe portaluri."
        confirmLabel="Restabilește"
        onConfirm={async () => {
          if (!target) return;
          const { error } = await supabase.rpc("restore_property" as never, { _id: target.id } as never);
          if (error) {
            toastError(error);
            throw error;
          }
          toast.success("Anunțul a fost restabilit.");
          queryClient.invalidateQueries({ queryKey: ["superadmin", "deleted-properties"] });
          queryClient.invalidateQueries({ queryKey: ["properties"] });
        }}
      />
    </>
  );
}

type DeletedLead = {
  id: string;
  name: string;
  organization_id: string;
  property_id: string | null;
  deleted_at: string;
  deleted_by: string | null;
  pre_delete_stage: string | null;
};

function DeletedLeadsTab() {
  const [q, setQ] = useState("");
  const [target, setTarget] = useState<DeletedLead | null>(null);
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["superadmin", "deleted-leads"],
    queryFn: async () => {
      const { data: rows, error } = await supabase
        .from("leads")
        .select("id, name, organization_id, property_id, deleted_at, deleted_by, pre_delete_stage")
        .not("deleted_at", "is", null)
        .order("deleted_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      const list = (rows ?? []) as DeletedLead[];
      const orgIds = [...new Set(list.map((r) => r.organization_id))];
      const userIds = [...new Set(list.map((r) => r.deleted_by).filter(Boolean))] as string[];
      const propIds = [...new Set(list.map((r) => r.property_id).filter(Boolean))] as string[];
      const [orgs, profiles, props] = await Promise.all([
        orgIds.length ? supabase.from("organizations").select("id,name").in("id", orgIds) : { data: [] },
        userIds.length ? supabase.from("profiles").select("id,full_name").in("id", userIds) : { data: [] },
        propIds.length ? supabase.from("properties").select("id,reference,title").in("id", propIds) : { data: [] },
      ]);
      return {
        rows: list,
        orgs: new Map((orgs.data ?? []).map((o) => [o.id, o.name as string])),
        people: new Map((profiles.data ?? []).map((p) => [p.id, (p.full_name as string | null) ?? "—"])),
        props: new Map(
          (props.data ?? []).map((p) => [p.id, `${(p.reference as string | null) ?? ""} ${(p.title as string) ?? ""}`.trim()]),
        ),
      };
    },
  });
  const term = q.trim().toLowerCase();
  const rows = (data?.rows ?? []).filter((r) =>
    term ? `${r.name} ${data?.orgs.get(r.organization_id) ?? ""}`.toLowerCase().includes(term) : true,
  );
  return (
    <>
      <div className="relative mb-4 max-w-md">
        <Search className="pointer-events-none absolute top-2.5 left-3 size-4 text-muted-foreground" />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Caută după client sau agenție…"
          aria-label="Caută după client sau agenție"
          className="pl-9"
        />
      </div>
      {isLoading ? (
        <ListSkeleton rows={6} />
      ) : rows.length === 0 ? (
        <EmptyState icon={Trash2} title="Niciun lead șters" description="Lead-urile șterse apar aici." />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-muted-foreground uppercase">
              <tr>
                <th className="py-2 pr-3">Agenție</th>
                <th className="py-2 pr-3">Client</th>
                <th className="py-2 pr-3">Proprietate</th>
                <th className="py-2 pr-3">Etapa anterioară</th>
                <th className="py-2 pr-3">Șters de</th>
                <th className="py-2 pr-3">Când</th>
                <th className="py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="py-2 pr-3">{data?.orgs.get(r.organization_id) ?? "—"}</td>
                  <td className="py-2 pr-3">{r.name}</td>
                  <td className="max-w-[240px] truncate py-2 pr-3">
                    {r.property_id ? (data?.props.get(r.property_id) ?? "—") : "—"}
                  </td>
                  <td className="py-2 pr-3">
                    {r.pre_delete_stage
                      ? ((leadStageLabels as Record<string, string>)[r.pre_delete_stage] ?? r.pre_delete_stage)
                      : "—"}
                  </td>
                  <td className="py-2 pr-3">{r.deleted_by ? (data?.people.get(r.deleted_by) ?? "—") : "—"}</td>
                  <td className="py-2 pr-3">{formatDateTime(r.deleted_at)}</td>
                  <td className="py-2 text-right">
                    <Button variant="outline" size="sm" onClick={() => setTarget(r)}>
                      Restabilește
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <ConfirmDialog
        open={target !== null}
        onOpenChange={(o) => !o && setTarget(null)}
        title={`Restabilești lead-ul ${target?.name ?? ""}?`}
        description="Lead-ul revine în etapa de dinainte și redevine vizibil în agenție."
        confirmLabel="Restabilește"
        onConfirm={async () => {
          if (!target) return;
          const { error } = await supabase.rpc("restore_lead", { _id: target.id });
          if (error) {
            toastError(error);
            throw error;
          }
          toast.success("Lead-ul a fost restabilit.");
          queryClient.invalidateQueries({ queryKey: ["superadmin", "deleted-leads"] });
          queryClient.invalidateQueries({ queryKey: ["leads"] });
        }}
      />
    </>
  );
}
