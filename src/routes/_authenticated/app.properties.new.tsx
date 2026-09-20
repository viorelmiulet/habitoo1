import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  PropertyDetailsFields,
  type PropertyDetailsValue,
} from "@/components/app/PropertyDetailsFields";
import {
  PropertyTransactionFields,
  emptyTransaction,
  hasTransactionSelection,
  transactionPayload,
  type TransactionValue,
} from "@/components/app/PropertyTransactionFields";
import { toast } from "@/components/ui/sonner";
import { toastError } from "@/lib/errors";
import { PageHeader } from "@/components/app/PageHeader";
import { FormSection, RequiredMark } from "@/components/app/FormSection";
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
import { useServerFn } from "@tanstack/react-start";
import { resolvePropertyPostalCode } from "@/lib/geo/postal-code.functions";
import { notifyProperstarFeedChanged } from "@/lib/portals/properstar-cache";
import { LocationPicker, emptyLocation, type LocationValue } from "@/components/app/LocationPicker";
import { PropertyLocationMap } from "@/components/app/PropertyLocationMap";
import { useCurrentUser } from "@/hooks/use-session";
import { appHead } from "@/components/app/app-head";

/** Notificare neblocantă despre codul poștal dedus la salvare. */
function postalNotice(report: { status: string; reasonLabel: string } | null): void {
  if (!report) return;
  if (report.status === "failed") {
    toast.warning(`Codul poștal nu a putut fi completat automat: ${report.reasonLabel}`);
  } else if (report.status === "not_found" || report.status === "capped") {
    toast.warning(`Codul poștal a rămas necompletat: ${report.reasonLabel}`);
  }
}

export const Route = createFileRoute("/_authenticated/app/properties/new")({
  head: () => appHead("Habitoo CRM — proprietate nouă"),
  component: NewPropertyPage,
});

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
    status: "draft",
    city: "",
    county: "",
    district: "",
    address: "",
    description: "",
    internal_notes: "",
    owner_contact_id: "",
    commission: "",
  });
  // Secțiunile de detalii (Detalii / Suprafețe / Clădire / Utilități / Finisaje / Dotări).
  // Toate caracteristicile proprietății se completează aici, o singură dată:
  // tip, camere, băi, etaj, suprafețe, an construcție, facilități.
  const [details, setDetails] = useState<PropertyDetailsValue>({
    property_type: "apartment",
  });
  // Vânzare / închiriere (pot fi active simultan), fiecare cu preț și monedă.
  const [tx, setTx] = useState<TransactionValue>(emptyTransaction);
  // Localizarea oficială (nomenclator SIRUTA); textul din `city`/`county` rămâne sincronizat cu selecția.
  const [location, setLocation] = useState<LocationValue>(emptyLocation);
  // Poziția pe hartă (Leaflet/OpenStreetMap) și precizia locației.
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [locationPrecise, setLocationPrecise] = useState(false);
  // Seed stabil pentru aproximarea zonei înainte ca proprietatea să aibă id.
  const [mapSeed] = useState(() => `new-${Math.random().toString(36).slice(2)}`);

  const set = (key: keyof typeof form, value: string | boolean) =>
    setForm((f) => ({ ...f, [key]: value }));

  const resolvePostalCode = useServerFn(resolvePropertyPostalCode);

  const create = useMutation({
    mutationFn: async () => {
      if (!user?.organization?.id) throw new Error("Agenția nu este configurată.");
      if (!hasTransactionSelection(tx))
        throw new Error("Alege tipul tranzacției: de vânzare, de închiriere sau ambele.");
      // Referință unică pe toată platforma: o secvență în baza de date, nu
      // „max + 1” per agenție (doi agenți care salvau simultan puteau primi
      // același număr, iar numerele se dublau între agenții).
      const { data: reference, error: referenceError } =
        await supabase.rpc("next_property_reference");
      if (referenceError) throw referenceError;
      const { data, error } = await supabase
        .from("properties")
        .insert({
          organization_id: user.organization.id,
          assigned_to: user.userId,
          created_by: user.userId,
          reference,
          title: form.title,
          status: form.status as never,
          ...transactionPayload(tx),
          city: location.localityName || form.city || null,
          county: location.countyName || form.county || null,
          county_siruta_code: location.countySirutaCode,
          uat_siruta_code: location.uatSirutaCode,
          locality_siruta_code: location.localitySirutaCode,
          district: form.district || null,
          address: form.address || null,
          lat: coords?.lat ?? null,
          lng: coords?.lng ?? null,
          location_precise: locationPrecise,
          description: form.description || null,
          internal_notes: form.internal_notes || null,
          owner_contact_id: form.owner_contact_id || null,
          commission: form.commission || null,
          ...details,
        })
        .select("id")
        .single();
      if (error) throw error;
      // Codul poștal se deduce din adresă pe server; lipsa lui nu blochează
      // salvarea, dar rezultatul (inclusiv eșecul) se arată utilizatorului.
      let postal: { status: string; reasonLabel: string } | null = null;
      try {
        postal = (await resolvePostalCode({ data: { propertyId: data.id } })) ?? null;
      } catch (error) {
        postal = {
          status: "failed",
          reasonLabel: error instanceof Error ? error.message : "eroare necunoscută",
        };
      }
      return { ...data, postal };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["properties"] });
      notifyProperstarFeedChanged();
      toast.success("Proprietatea a fost adăugată.");
      postalNotice(data.postal);
      navigate({ to: "/app/properties/$id", params: { id: data.id } });
    },
    onError: (e: Error) => toastError(e),
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
        className="space-y-8"
        onSubmit={(e) => {
          e.preventDefault();
          create.mutate();
        }}
      >
        <FormSection title="Informații generale">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="title">
                Titlu anunț
                <RequiredMark />
              </Label>
              <Input
                id="title"
                required
                value={form.title}
                onChange={(e) => set("title", e.target.value)}
                placeholder="Apartament 3 camere, Aviatorilor"
              />
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
        </FormSection>

        <FormSection title="Tranzacție și preț" description="Alege vânzare, închiriere sau ambele.">
          <PropertyTransactionFields idPrefix="new" value={tx} onChange={setTx} />

          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="commission">Comision</Label>
              <Input
                id="commission"
                value={form.commission}
                onChange={(e) => set("commission", e.target.value)}
                placeholder="2%"
              />
            </div>
          </div>
        </FormSection>

        <FormSection
          title="Detalii complete"
          description="Tip, camere, băi, etaj, suprafețe, an construcție și facilități."
        >
          <PropertyDetailsFields
            idPrefix="new"
            value={details}
            onChange={(patch) => setDetails((d) => ({ ...d, ...patch }))}
          />
        </FormSection>

        <FormSection title="Localizare">
          <div className="grid gap-4 md:grid-cols-2">
            <LocationPicker idPrefix="new" value={location} onChange={setLocation} />
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
              <Input
                id="address"
                value={form.address}
                onChange={(e) => set("address", e.target.value)}
              />
            </div>
          </div>
          <PropertyLocationMap
            idPrefix="new"
            seed={mapSeed}
            lat={coords?.lat ?? null}
            lng={coords?.lng ?? null}
            precise={locationPrecise}
            addressParts={[form.address, form.district, location.localityName, location.countyName]}
            onCoordsChange={setCoords}
            onPreciseChange={setLocationPrecise}
          />
        </FormSection>

        <FormSection title="Descriere">
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
        </FormSection>

        <div className="flex justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => navigate({ to: "/app/properties" })}
          >
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
