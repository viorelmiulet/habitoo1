import { useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useNavigate } from "@tanstack/react-router";
import { AlertTriangle, Camera, CheckCircle2, Loader2, RotateCcw, ShieldCheck } from "lucide-react";
import { toast } from "@/components/ui/sonner";
import { toastError } from "@/lib/errors";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { isValidCnp, type InventoryItem, type PartyRole } from "@/lib/contracts/templates";
import { prepareIdCapture } from "@/lib/contracts/image";
import { createContract, getContractInventoryDefaults, listTemplates } from "@/lib/contracts.functions";
import { getIdReadingStatus, readIdDocument } from "@/lib/contracts/id-document.functions";
import {
  applyIdReading,
  confirmPendingFields,
  conflictLabel,
  emptyPartyIdState,
  idGenerationBlockers,
  idWarningMessage,
  resolveConflict,
  type IdFormKey,
  type PartyIdState,
} from "@/lib/contracts/id/form-state";
import type { IdFieldConflict } from "@/lib/contracts/id/vision.parse";
import { useCurrentUser } from "@/hooks/use-session";
import { InventoryEditor } from "./InventoryEditor";

type PartyTarget = "landlord" | "tenant" | "beneficiary";
type CaptureSide = "back" | "front";

type PartyForm = {
  role: PartyRole;
  fullName: string;
  email: string;
  phone: string;
  address: string;
  cnp: string;
  idSeries: string;
  idNumber: string;
  idIssuer: string;
  idIssuedOn: string;
  birthDate: string;
  citizenship: string;
};

const emptyParty = (role: PartyRole): PartyForm => ({
  role, fullName: "", email: "", phone: "", address: "", cnp: "", idSeries: "",
  idNumber: "", idIssuer: "", idIssuedOn: "", birthDate: "", citizenship: "romana",
});

export function NewContractDialog({ open, onOpenChange, propertyId, contactId }: {
  open: boolean;
  onOpenChange: (value: boolean) => void;
  propertyId?: string;
  contactId?: string;
}) {
  const navigate = useNavigate();
  const { data: currentUser } = useCurrentUser();
  const fetchTemplates = useServerFn(listTemplates);
  const fetchInventory = useServerFn(getContractInventoryDefaults);
  const runCreate = useServerFn(createContract);
  const runExtract = useServerFn(extractIdDocument);
  const fetchExtractionStatus = useServerFn(getIdExtractionStatus);
  const landlordFileRef = useRef<HTMLInputElement>(null);
  const tenantFileRef = useRef<HTMLInputElement>(null);
  const beneficiaryFileRef = useRef<HTMLInputElement>(null);
  const [documentKind, setDocumentKind] = useState<"rent_agreement" | "exclusive_representation">("rent_agreement");
  const [templateId, setTemplateId] = useState("");
  const [selectedProperty, setSelectedProperty] = useState(propertyId ?? "");
  const [selectedContact, setSelectedContact] = useState(contactId ?? "");
  const [landlord, setLandlord] = useState<PartyForm>(emptyParty("landlord"));
  const [tenant, setTenant] = useState<PartyForm>(emptyParty("tenant"));
  const [beneficiary, setBeneficiary] = useState<PartyForm>(emptyParty("seller"));
  const [extractTarget, setExtractTarget] = useState<"landlord" | "tenant" | "beneficiary">("landlord");
  const [destination, setDestination] = useState("locuinta");
  const [durationMonths, setDurationMonths] = useState("");
  const [startDate, setStartDate] = useState("");
  const [rent, setRent] = useState("");
  const [currency, setCurrency] = useState("EUR");
  const [deposit, setDeposit] = useState("");
  const [includeInventory, setIncludeInventory] = useState(false);
  const [inventory, setInventory] = useState<InventoryItem[] | null>(null);
  const [contractNumber, setContractNumber] = useState("");
  const [commission, setCommission] = useState("3");
  const [negotiable, setNegotiable] = useState<"DA" | "NU">("DA");
  const [exclusiveProperty, setExclusiveProperty] = useState({ locality: "", street: "", streetNumber: "", county: "", rooms: "", layout: "", floor: "", comfort: "", bathrooms: "", balconies: "", usableSurface: "", price: "", currency: "EUR" });

  const templates = useQuery({ queryKey: ["contract-templates"], queryFn: () => fetchTemplates({}), enabled: open });
  const defaults = useQuery({ queryKey: ["contract-inventory-defaults"], queryFn: () => fetchInventory({}), enabled: open });
  const extractionStatus = useQuery({ queryKey: ["contract-id-extraction-status"], queryFn: () => fetchExtractionStatus({}), enabled: open, staleTime: 300_000 });
  const extractionEnabled = extractionStatus.data?.configured !== false;
  const rentalTemplates = useMemo(() => (templates.data ?? []).filter((item) => item.kind === "rent_agreement"), [templates.data]);
  const exclusiveTemplates = useMemo(() => (templates.data ?? []).filter((item) => item.kind === "exclusive_representation"), [templates.data]);
  const kindTemplates = documentKind === "rent_agreement" ? rentalTemplates : exclusiveTemplates;
  const activeTemplate = kindTemplates.some((item) => item.id === templateId) ? templateId : kindTemplates[0]?.id || "";

  const properties = useQuery({
    queryKey: ["contract-properties"], enabled: open,
    queryFn: async () => {
      const { data, error } = await supabase.from("properties").select("id,title,reference,address,city,county,street,street_number,rooms,layout,floor,floor_label,comfort,bathrooms,balconies,usable_surface,surface,price,currency,negotiable,commission,owner_contact_id").is("archived_at", null).order("created_at", { ascending: false }).limit(100);
      if (error) throw error;
      return data;
    },
  });
  const contacts = useQuery({
    queryKey: ["contract-contacts"], enabled: open,
    queryFn: async () => {
      const { data, error } = await supabase.from("contacts").select("id,first_name,last_name,email,phone").order("created_at", { ascending: false }).limit(200);
      if (error) throw error;
      return data;
    },
  });

  const extract = useMutation({
    mutationFn: async ({ file, target }: { file: File; target: "landlord" | "tenant" | "beneficiary" }) => ({ target, result: await runExtract({ data: await prepareIdImage(file).then((prepared) => ({ imageBase64: prepared.base64, mimeType: prepared.mimeType })) }) }),
    onSuccess: ({ target, result }) => {
      const setter = target === "landlord" ? setLandlord : target === "tenant" ? setTenant : setBeneficiary;
      setter((previous) => ({ ...previous, fullName: [result.lastName, result.firstName].filter(Boolean).join(" ").trim() || previous.fullName, cnp: result.cnp || previous.cnp, idSeries: result.series || previous.idSeries, idNumber: result.number || previous.idNumber, idIssuer: result.issuer || previous.idIssuer, idIssuedOn: result.issuedOn || previous.idIssuedOn, address: result.address || previous.address, birthDate: result.birthDate || previous.birthDate }));
      if (result.failure) toast.error(result.failure, { duration: 9000 });
      else toast.success("Date completate din act. Verifică-le înainte de a continua.");
    },
    onError: (error: Error) => toast.error(error.message, { duration: 9000 }),
  });

  const create = useMutation({
    mutationFn: async () => {
      if (!activeTemplate) throw new Error("Șablonul documentului nu este disponibil.");
      const clientParties = documentKind === "rent_agreement" ? [landlord, tenant] : [beneficiary];
      if (clientParties.some((party) => party.fullName.trim().length < 3)) throw new Error("Completează numele tuturor părților.");
      for (const party of clientParties) if (party.cnp && !isValidCnp(party.cnp)) throw new Error(`CNP-ul pentru ${party.fullName} nu este valid.`);
      const cleanInventory = (inventory ?? defaults.data?.items ?? []).filter((item) => item.name.trim());
      const parties = documentKind === "rent_agreement" ? [landlord, tenant] : [
        { ...emptyParty("agent"), fullName: currentUser?.profile?.full_name || currentUser?.organization?.legal_representative || currentUser?.organization?.name || "Reprezentant agenție", email: currentUser?.email || "" },
        beneficiary,
      ];
      return runCreate({ data: {
        templateId: activeTemplate, kind: documentKind, propertyId: selectedProperty || undefined,
        contactId: selectedContact || undefined, price: documentKind === "exclusive_representation" ? (exclusiveProperty.price ? Number(exclusiveProperty.price) : undefined) : (rent ? Number(rent) : undefined), currency: documentKind === "exclusive_representation" ? exclusiveProperty.currency : currency,
        durationMonths: durationMonths ? Number(durationMonths) : documentKind === "exclusive_representation" ? 6 : undefined, startDate: startDate || undefined,
        destination: destination.trim() || undefined, deposit: deposit ? Number(deposit) : undefined,
        includeInventory: documentKind === "rent_agreement" && includeInventory, inventory: includeInventory ? cleanInventory : undefined,
        contractNumber: documentKind === "exclusive_representation" ? contractNumber || undefined : undefined,
        commission: documentKind === "exclusive_representation" ? commission : undefined,
        negotiable: documentKind === "exclusive_representation" ? negotiable : undefined,
        exclusiveProperty: documentKind === "exclusive_representation" ? exclusiveProperty : undefined,
        parties: parties.map((party) => ({ ...party, email: party.email.trim(), phone: party.phone.trim() || undefined, address: party.address.trim() || undefined, cnp: party.cnp.trim() || undefined, idSeries: party.idSeries.trim() || undefined, idNumber: party.idNumber.trim() || undefined, idIssuer: party.idIssuer.trim() || undefined, idIssuedOn: party.idIssuedOn.trim() || undefined, birthDate: party.birthDate.trim() || undefined, citizenship: party.citizenship.trim() || undefined })),
      } });
    },
    onSuccess: ({ id }) => { toast.success("Contract creat."); onOpenChange(false); navigate({ to: "/app/contracts/$id", params: { id } }); },
    onError: (error: Error) => toastError(error),
  });

  const selectContact = (value: string) => {
    setSelectedContact(value === "none" ? "" : value);
    const found = contacts.data?.find((contact) => contact.id === value);
    if (found) {
      const setter = documentKind === "rent_agreement" ? setTenant : setBeneficiary;
      setter((previous) => ({ ...previous, fullName: [found.first_name, found.last_name].filter(Boolean).join(" ") || previous.fullName, email: found.email ?? previous.email, phone: found.phone ?? previous.phone }));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-5xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Document nou</DialogTitle>
          <DialogDescription>Alege documentul, completează datele și verifică informațiile citite din act.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5"><Label>Tip document</Label><Select value={documentKind} onValueChange={(value) => { setDocumentKind(value as typeof documentKind); setTemplateId(""); }}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="rent_agreement">Contract de închiriere</SelectItem><SelectItem value="exclusive_representation">Contract de reprezentare exclusivă</SelectItem></SelectContent></Select></div>
          <div className="space-y-1.5"><Label>Șablon</Label><Select value={activeTemplate} onValueChange={setTemplateId}><SelectTrigger><SelectValue placeholder="Alege șablonul" /></SelectTrigger><SelectContent>{kindTemplates.map((item) => <SelectItem key={item.id} value={item.id}>{item.name}{item.isPlatform ? " · Habitoo" : ""}</SelectItem>)}</SelectContent></Select></div>
          <div className="space-y-1.5"><Label>Proprietate</Label><Select value={selectedProperty || "none"} onValueChange={(value) => { setSelectedProperty(value === "none" ? "" : value); const found = properties.data?.find((property) => property.id === value); if (found) { setRent(found.price ? String(found.price) : ""); setCurrency(found.currency ?? "EUR"); setCommission(found.commission ?? "3"); setNegotiable(found.negotiable ? "DA" : "NU"); setExclusiveProperty({ locality: found.city ?? "", street: found.street ?? "", streetNumber: found.street_number ?? "", county: found.county ?? "", rooms: found.rooms == null ? "" : String(found.rooms), layout: found.layout ?? "", floor: found.floor_label ?? (found.floor == null ? "" : String(found.floor)), comfort: found.comfort ?? "", bathrooms: found.bathrooms == null ? "" : String(found.bathrooms), balconies: found.balconies == null ? "" : String(found.balconies), usableSurface: found.usable_surface == null ? (found.surface == null ? "" : String(found.surface)) : String(found.usable_surface), price: found.price == null ? "" : String(found.price), currency: found.currency ?? "EUR" }); if (found.owner_contact_id) { setSelectedContact(found.owner_contact_id); selectContact(found.owner_contact_id); } } }}><SelectTrigger><SelectValue placeholder="Alege proprietatea" /></SelectTrigger><SelectContent><SelectItem value="none">Fără proprietate</SelectItem>{properties.data?.map((property) => <SelectItem key={property.id} value={property.id}>{property.reference ? `${property.reference} · ` : ""}{property.title}</SelectItem>)}</SelectContent></Select></div>
          <div className="space-y-1.5"><Label>{documentKind === "rent_agreement" ? "Chiriaș" : "Beneficiar"} din CRM</Label><Select value={selectedContact || "none"} onValueChange={selectContact}><SelectTrigger><SelectValue placeholder="Fără contact" /></SelectTrigger><SelectContent><SelectItem value="none">Fără contact</SelectItem>{contacts.data?.map((contact) => <SelectItem key={contact.id} value={contact.id}>{[contact.first_name, contact.last_name].filter(Boolean).join(" ")}</SelectItem>)}</SelectContent></Select></div>
          {documentKind === "exclusive_representation" ? <><Field label="Număr contract (opțional, generat automat)" value={contractNumber} onChange={setContractNumber} placeholder="CTR-000001" /><Field label="Comision (%)" value={commission} onChange={setCommission} /><Field label="Durată (luni)" value={durationMonths || "6"} onChange={(value) => setDurationMonths(value.replace(/\D/g, ""))} /><div className="space-y-1.5"><Label>Negociabil</Label><Select value={negotiable} onValueChange={(value) => setNegotiable(value as "DA" | "NU")}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="DA">DA</SelectItem><SelectItem value="NU">NU</SelectItem></SelectContent></Select></div></> : <>
          <Field label="Destinație" value={destination} onChange={setDestination} />
          <Field label="Durată (luni)" value={durationMonths} onChange={(value) => setDurationMonths(value.replace(/\D/g, ""))} />
          <Field label="Data începerii" value={startDate} onChange={setStartDate} placeholder="ZZ.LL.AAAA" />
          <Field label="Chirie lunară" value={rent} onChange={(value) => setRent(value.replace(/[^\d.]/g, ""))} />
          <Field label="Monedă" value={currency} onChange={setCurrency} />
          <Field label="Garanție" value={deposit} onChange={(value) => setDeposit(value.replace(/[^\d.]/g, ""))} />
          </>}
        </div>

        {documentKind === "rent_agreement" ? <div className="grid gap-4 lg:grid-cols-2">
          <PartySection title="1. Proprietar (locator)" party={landlord} onChange={setLandlord} fileRef={landlordFileRef} extractionEnabled={extractionEnabled} extracting={extract.isPending && extractTarget === "landlord"} onFile={(file) => { setExtractTarget("landlord"); extract.mutate({ file, target: "landlord" }); }} />
          <PartySection title="2. Chiriaș (locatar)" party={tenant} onChange={setTenant} fileRef={tenantFileRef} extractionEnabled={extractionEnabled} extracting={extract.isPending && extractTarget === "tenant"} onFile={(file) => { setExtractTarget("tenant"); extract.mutate({ file, target: "tenant" }); }} />
        </div> : <><div className="grid gap-3 rounded-md border border-border p-4 sm:grid-cols-3"><h3 className="sm:col-span-3 text-sm font-semibold">Date proprietate (editabile)</h3>{Object.entries(exclusiveProperty).map(([key, value]) => <Field key={key} label={({ locality: "Localitate", street: "Stradă", streetNumber: "Număr", county: "Județ", rooms: "Camere", layout: "Compartimentare", floor: "Etaj", comfort: "Confort", bathrooms: "Băi", balconies: "Balcoane", usableSurface: "Suprafață utilă", price: "Preț", currency: "Monedă" } as Record<string,string>)[key] ?? key} value={value} onChange={(next) => setExclusiveProperty((current) => ({ ...current, [key]: next }))} />)}</div><PartySection title="Beneficiar" party={beneficiary} onChange={setBeneficiary} fileRef={beneficiaryFileRef} extractionEnabled={extractionEnabled} extracting={extract.isPending && extractTarget === "beneficiary"} onFile={(file) => { setExtractTarget("beneficiary"); extract.mutate({ file, target: "beneficiary" }); }} /></>}

        {documentKind === "rent_agreement" ? <div className="space-y-4 rounded-md border border-border p-4">
          <div className="flex items-start gap-3"><Checkbox id="include-inventory" checked={includeInventory} onCheckedChange={(checked) => { const next = checked === true; setIncludeInventory(next); if (next && inventory === null) setInventory(defaults.data?.items ?? []); }} /><div><Label htmlFor="include-inventory">Include proces-verbal de predare-primire</Label><p className="text-xs text-muted-foreground">Anexa se include în același PDF și se semnează împreună cu contractul.</p></div></div>
          {includeInventory ? <InventoryEditor items={inventory ?? defaults.data?.items ?? []} onChange={setInventory} /> : null}
        </div> : null}
        <DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>Anulează</Button><Button onClick={() => create.mutate()} disabled={create.isPending}>{create.isPending ? <Loader2 className="size-4 animate-spin" /> : null} Creează contractul</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PartySection({ title, party, onChange, fileRef, extractionEnabled, extracting, onFile }: { title: string; party: PartyForm; onChange: (party: PartyForm) => void; fileRef: React.RefObject<HTMLInputElement | null>; extractionEnabled: boolean; extracting: boolean; onFile: (file: File) => void }) {
  const set = (key: keyof PartyForm, value: string) => onChange({ ...party, [key]: value });
  return <section className="space-y-4 rounded-md border border-border p-4"><div className="flex flex-wrap items-center justify-between gap-2"><h3 className="text-sm font-semibold">{title}</h3><input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; if (file) onFile(file); event.target.value = ""; }} /><Button type="button" size="sm" variant="outline" onClick={() => fileRef.current?.click()} disabled={extracting || !extractionEnabled}>{extracting ? <Loader2 className="size-4 animate-spin" /> : <Camera className="size-4" />} Citește actul</Button></div><p className="flex items-start gap-1.5 text-xs text-muted-foreground"><ShieldCheck className="mt-0.5 size-3.5 shrink-0" />Fotografia nu este salvată. Verifică toate datele completate.</p><div className="grid gap-3 sm:grid-cols-2"><Field label="Nume complet" value={party.fullName} onChange={(value) => set("fullName", value)} className="sm:col-span-2" /><Field label="CNP" value={party.cnp} onChange={(value) => set("cnp", value.replace(/\D/g, "").slice(0, 13))} /><Field label="Cetățenie" value={party.citizenship} onChange={(value) => set("citizenship", value)} /><Field label="Serie act" value={party.idSeries} onChange={(value) => set("idSeries", value)} /><Field label="Număr act" value={party.idNumber} onChange={(value) => set("idNumber", value)} /><Field label="Eliberat de" value={party.idIssuer} onChange={(value) => set("idIssuer", value)} /><Field label="Data eliberării" value={party.idIssuedOn} onChange={(value) => set("idIssuedOn", value)} placeholder="ZZ.LL.AAAA" /><Field label="Domiciliu" value={party.address} onChange={(value) => set("address", value)} className="sm:col-span-2" /><Field label="Email" value={party.email} onChange={(value) => set("email", value)} /><Field label="Telefon" value={party.phone} onChange={(value) => set("phone", value)} /></div></section>;
}

function Field({ label, value, onChange, placeholder, className }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string; className?: string }) {
  return <div className={`space-y-1.5 ${className ?? ""}`}><Label>{label}</Label><Input value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} /></div>;
}