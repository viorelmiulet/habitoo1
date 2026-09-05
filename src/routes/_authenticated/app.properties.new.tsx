import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/app/PageHeader";
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
import { useCurrentUser } from "@/hooks/use-session";
import { propertyTypeLabels } from "@/lib/labels";

export const Route = createFileRoute("/_authenticated/app/properties/new")({
  component: NewPropertyPage,
});

const featureOptions = [
  "Balcon",
  "Parcare",
  "Lift",
  "Terasă",
  "Aer condiționat",
  "Mobilat",
  "Boxă",
  "Grădină",
  "Centrală proprie",
];

function NewPropertyPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: user } = useCurrentUser();

  const { data: owners = [] } = useQuery({
    queryKey: ["contacts", "owners"],
    queryFn: async () => {
      const { data } = await supabase
        .from("contacts")
        .select("id,first_name,last_name,type")
        .order("first_name");
      return data ?? [];
    },
  });

  const [form, setForm] = useState({
    title: "",
    property_type: "apartment",
    transaction_kind: "sale",
    status: "draft",
    price: "",
    currency: "EUR",
    surface: "",
    rooms: "",
    bathrooms: "",
    floor: "",
    build_year: "",
    city: "",
    county: "",
    district: "",
    address: "",
    description: "",
    internal_notes: "",
    owner_contact_id: "",
    commission: "",
    collaboration: false,
  });
  const [features, setFeatures] = useState<string[]>([]);

  const set = (key: keyof typeof form, value: string | boolean) =>
    setForm((f) => ({ ...f, [key]: value }));

  const create = useMutation({
    mutationFn: async () => {
      if (!user?.organization?.id) throw new Error("Agenția nu este configurată.");
      const num = (v: string) => (v.trim() === "" ? null : Number(v));
      const { data, error } = await supabase
        .from("properties")
        .insert({
          organization_id: user.organization.id,
          assigned_to: user.userId,
          created_by: user.userId,
          title: form.title,
          property_type: form.property_type,
          transaction_kind: form.transaction_kind as never,
          status: form.status as never,
          price: num(form.price),
          currency: form.currency,
          surface: num(form.surface),
          rooms: num(form.rooms),
          bathrooms: num(form.bathrooms),
          floor: num(form.floor),
          build_year: num(form.build_year),
          city: form.city || null,
          county: form.county || null,
          district: form.district || null,
          address: form.address || null,
          description: form.description || null,
          internal_notes: form.internal_notes || null,
          owner_contact_id: form.owner_contact_id || null,
          commission: form.commission || null,
          collaboration: form.collaboration,
          features,
        })
        .select("id")
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["properties"] });
      toast.success("Proprietatea a fost adăugată.");
      navigate({ to: "/app/properties/$id", params: { id: data.id } });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <>
      <PageHeader
        title="Adaugă proprietate"
        description="Completează datele esențiale; restul pot fi editate ulterior din pagina proprietății."
        actions={
          <Button variant="outline" size="sm" onClick={() => navigate({ to: "/app/properties" })}>
            Renunță
          </Button>
        }
      />

      <form
        className="space-y-6"
        onSubmit={(e) => {
          e.preventDefault();
          create.mutate();
        }}
      >
        <section className="panel space-y-4 p-5">
          <h2 className="text-sm font-semibold">Informații generale</h2>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="title">Titlu anunț</Label>
              <Input
                id="title"
                required
                value={form.title}
                onChange={(e) => set("title", e.target.value)}
                placeholder="Apartament 3 camere, Aviatorilor"
              />
            </div>
            <div className="space-y-2">
              <Label>Tip proprietate</Label>
              <Select value={form.property_type} onValueChange={(v) => set("property_type", v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(propertyTypeLabels).map(([k, v]) => (
                    <SelectItem key={k} value={k}>
                      {v}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Tranzacție</Label>
              <Select value={form.transaction_kind} onValueChange={(v) => set("transaction_kind", v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="sale">Vânzare</SelectItem>
                  <SelectItem value="rent">Închiriere</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Status</Label>
              <Select value={form.status} onValueChange={(v) => set("status", v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="draft">Draft</SelectItem>
                  <SelectItem value="active">Activ</SelectItem>
                  <SelectItem value="reserved">Rezervat</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Proprietar</Label>
              <Select
                value={form.owner_contact_id || "none"}
                onValueChange={(v) => set("owner_contact_id", v === "none" ? "" : v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selectează contact" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Fără proprietar asociat</SelectItem>
                  {owners.map((o) => (
                    <SelectItem key={o.id} value={o.id}>
                      {o.first_name} {o.last_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </section>

        <section className="panel space-y-4 p-5">
          <h2 className="text-sm font-semibold">Preț și caracteristici</h2>
          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="price">Preț</Label>
              <Input
                id="price"
                type="number"
                min="0"
                value={form.price}
                onChange={(e) => set("price", e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Monedă</Label>
              <Select value={form.currency} onValueChange={(v) => set("currency", v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="EUR">EUR</SelectItem>
                  <SelectItem value="RON">RON</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="commission">Comision</Label>
              <Input
                id="commission"
                value={form.commission}
                onChange={(e) => set("commission", e.target.value)}
                placeholder="2%"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="surface">Suprafață utilă (m²)</Label>
              <Input
                id="surface"
                type="number"
                min="0"
                value={form.surface}
                onChange={(e) => set("surface", e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="rooms">Camere</Label>
              <Input
                id="rooms"
                type="number"
                min="0"
                value={form.rooms}
                onChange={(e) => set("rooms", e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="bathrooms">Băi</Label>
              <Input
                id="bathrooms"
                type="number"
                min="0"
                value={form.bathrooms}
                onChange={(e) => set("bathrooms", e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="floor">Etaj</Label>
              <Input
                id="floor"
                type="number"
                value={form.floor}
                onChange={(e) => set("floor", e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="build_year">An construcție</Label>
              <Input
                id="build_year"
                type="number"
                value={form.build_year}
                onChange={(e) => set("build_year", e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Facilități</Label>
            <div className="flex flex-wrap gap-2">
              {featureOptions.map((f) => {
                const active = features.includes(f);
                return (
                  <Button
                    key={f}
                    type="button"
                    size="sm"
                    variant={active ? "default" : "outline"}
                    onClick={() =>
                      setFeatures((prev) => (active ? prev.filter((x) => x !== f) : [...prev, f]))
                    }
                  >
                    {f}
                  </Button>
                );
              })}
            </div>
          </div>
        </section>

        <section className="panel space-y-4 p-5">
          <h2 className="text-sm font-semibold">Localizare</h2>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="city">Oraș</Label>
              <Input id="city" value={form.city} onChange={(e) => set("city", e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="county">Județ</Label>
              <Input id="county" value={form.county} onChange={(e) => set("county", e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="district">Zonă / cartier</Label>
              <Input
                id="district"
                value={form.district}
                onChange={(e) => set("district", e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="address">Adresă</Label>
              <Input id="address" value={form.address} onChange={(e) => set("address", e.target.value)} />
            </div>
          </div>
        </section>

        <section className="panel space-y-4 p-5">
          <h2 className="text-sm font-semibold">Descriere</h2>
          <div className="space-y-2">
            <Label htmlFor="description">Descriere publică</Label>
            <Textarea
              id="description"
              rows={5}
              value={form.description}
              onChange={(e) => set("description", e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="internal_notes">Note interne (nu se publică)</Label>
            <Textarea
              id="internal_notes"
              rows={3}
              value={form.internal_notes}
              onChange={(e) => set("internal_notes", e.target.value)}
            />
          </div>
        </section>

        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => navigate({ to: "/app/properties" })}>
            Renunță
          </Button>
          <Button type="submit" disabled={create.isPending}>
            {create.isPending ? "Se salvează…" : "Salvează proprietatea"}
          </Button>
        </div>
      </form>
    </>
  );
}
