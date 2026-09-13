import { useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useNavigate } from "@tanstack/react-router";
import { Camera, Loader2, ScanLine, ShieldCheck } from "lucide-react";
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
import { prepareIdImage } from "@/lib/contracts/image";
import { createContract, extractIdDocument, getContractInventoryDefaults, getIdExtractionStatus, listTemplates } from "@/lib/contracts.functions";
import { InventoryEditor } from "./InventoryEditor";

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
  const fetchTemplates = useServerFn(listTemplates);
  const fetchInventory = useServerFn(getContractInventoryDefaults);
  const runCreate = useServerFn(createContract);
  const runExtract = useServerFn(extractIdDocument);
  const fetchExtractionStatus = useServerFn(getIdExtractionStatus);
  const landlordFileRef = useRef<HTMLInputElement>(null);
  const tenantFileRef = useRef<HTMLInputElement>(null);
  const [templateId, setTemplateId] = useState("");
  const [selectedProperty, setSelectedProperty] = useState(propertyId ?? "");
  const [selectedContact, setSelectedContact] = useState(contactId ?? "");
  const [landlord, setLandlord] = useState<PartyForm>(emptyParty("landlord"));
  const [tenant, setTenant] = useState<PartyForm>(emptyParty("tenant"));
  const [extractTarget, setExtractTarget] = useState<"landlord" | "tenant">("landlord");
  const [destination, setDestination] = useState("locuinta");
  const [durationMonths, setDurationMonths] = useState("");
  const [startDate, setStartDate] = useState("");
  const [rent, setRent] = useState("");
  const [currency, setCurrency] = useState("EUR");
  const [deposit, setDeposit] = useState("");
  const [includeInventory, setIncludeInventory] = useState(false);
  const [inventory, setInventory] = useState<InventoryItem[] | null>(null);

  const templates = useQuery({ queryKey: ["contract-templates"], queryFn: () => fetchTemplates({}), enabled: open });
  const defaults = useQuery({ queryKey: ["contract-inventory-defaults"], queryFn: () => fetchInventory({}), enabled: open });
  const extractionStatus = useQuery({ queryKey: ["contract-id-extraction-status"], queryFn: () => fetchExtractionStatus({}), enabled: open, staleTime: 300_000 });
  const extractionEnabled = extractionStatus.data?.configured !== false;
  const rentalTemplates = useMemo(() => (templates.data ?? []).filter((item) => item.kind === "rent_agreement"), [templates.data]);
  const activeTemplate = templateId || rentalTemplates[0]?.id || "";

  const properties = useQuery({
    queryKey: ["contract-properties"], enabled: open,
    queryFn: async () => {
      const { data, error } = await supabase.from("properties").select("id,title,reference,address,city,county,rooms,price,currency,owner_contact_id").is("archived_at", null).order("created_at", { ascending: false }).limit(100);
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
    mutationFn: async ({ file, target }: { file: File; target: "landlord" | "tenant" }) => ({ target, result: await runExtract({ data: await prepareIdImage(file).then((prepared) => ({ imageBase64: prepared.base64, mimeType: prepared.mimeType })) }) }),
    onSuccess: ({ target, result }) => {
      const setter = target === "landlord" ? setLandlord : setTenant;
      setter((previous) => ({ ...previous, fullName: [result.lastName, result.firstName].filter(Boolean).join(" ").trim() || previous.fullName, cnp: result.cnp || previous.cnp, idSeries: result.series || previous.idSeries, idNumber: result.number || previous.idNumber, idIssuer: result.issuer || previous.idIssuer, idIssuedOn: result.issuedOn || previous.idIssuedOn, address: result.address || previous.address, birthDate: result.birthDate || previous.birthDate }));
      if (result.failure) toast.error(result.failure, { duration: 9000 });
      else toast.success("Date completate din act. Verifică-le înainte de a continua.");
    },
    onError: (error: Error) => toast.error(error.message, { duration: 9000 }),
  });

  const create = useMutation({
    mutationFn: async () => {
      if (!activeTemplate) throw new Error("Șablonul de închiriere nu este disponibil.");
      if (landlord.fullName.trim().length < 3 || tenant.fullName.trim().length < 3) throw new Error("Completează numele proprietarului și al chiriașului.");
      for (const party of [landlord, tenant]) if (party.cnp && !isValidCnp(party.cnp)) throw new Error(`CNP-ul pentru ${party.fullName} nu este valid.`);
      const cleanInventory = (inventory ?? defaults.data?.items ?? []).filter((item) => item.name.trim());
      return runCreate({ data: {
        templateId: activeTemplate, kind: "rent_agreement", propertyId: selectedProperty || undefined,
        contactId: selectedContact || undefined, price: rent ? Number(rent) : undefined, currency,
        durationMonths: durationMonths ? Number(durationMonths) : undefined, startDate: startDate || undefined,
        destination: destination.trim() || undefined, deposit: deposit ? Number(deposit) : undefined,
        includeInventory, inventory: includeInventory ? cleanInventory : undefined,
        parties: [landlord, tenant].map((party) => ({ ...party, email: party.email.trim(), phone: party.phone.trim() || undefined, address: party.address.trim() || undefined, cnp: party.cnp.trim() || undefined, idSeries: party.idSeries.trim() || undefined, idNumber: party.idNumber.trim() || undefined, idIssuer: party.idIssuer.trim() || undefined, idIssuedOn: party.idIssuedOn.trim() || undefined, birthDate: party.birthDate.trim() || undefined, citizenship: party.citizenship.trim() || undefined })),
      } });
    },
    onSuccess: ({ id }) => { toast.success("Contract creat."); onOpenChange(false); navigate({ to: "/app/contracts/$id", params: { id } }); },
    onError: (error: Error) => toastError(error),
  });

  const selectContact = (value: string) => {
    setSelectedContact(value === "none" ? "" : value);
    const found = contacts.data?.find((contact) => contact.id === value);
    if (found) setTenant((previous) => ({ ...previous, fullName: [found.first_name, found.last_name].filter(Boolean).join(" ") || previous.fullName, email: found.email ?? previous.email, phone: found.phone ?? previous.phone }));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-5xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Contract de închiriere</DialogTitle>
          <DialogDescription>Completează proprietarul, chiriașul și condițiile contractului. Datele din act trebuie verificate înainte de creare.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5"><Label>Șablon</Label><Select value={activeTemplate} onValueChange={setTemplateId}><SelectTrigger><SelectValue placeholder="Alege șablonul" /></SelectTrigger><SelectContent>{rentalTemplates.map((item) => <SelectItem key={item.id} value={item.id}>{item.name}{item.isPlatform ? " · Habitoo" : ""}</SelectItem>)}</SelectContent></Select></div>
          <div className="space-y-1.5"><Label>Proprietate</Label><Select value={selectedProperty || "none"} onValueChange={(value) => { setSelectedProperty(value === "none" ? "" : value); const found = properties.data?.find((property) => property.id === value); if (found) { setRent(found.price ? String(found.price) : ""); setCurrency(found.currency ?? "EUR"); if (found.owner_contact_id) setSelectedContact(found.owner_contact_id); } }}><SelectTrigger><SelectValue placeholder="Alege proprietatea" /></SelectTrigger><SelectContent><SelectItem value="none">Fără proprietate</SelectItem>{properties.data?.map((property) => <SelectItem key={property.id} value={property.id}>{property.reference ? `${property.reference} · ` : ""}{property.title}</SelectItem>)}</SelectContent></Select></div>
          <div className="space-y-1.5"><Label>Chiriaș din CRM</Label><Select value={selectedContact || "none"} onValueChange={selectContact}><SelectTrigger><SelectValue placeholder="Fără contact" /></SelectTrigger><SelectContent><SelectItem value="none">Fără contact</SelectItem>{contacts.data?.map((contact) => <SelectItem key={contact.id} value={contact.id}>{[contact.first_name, contact.last_name].filter(Boolean).join(" ")}</SelectItem>)}</SelectContent></Select></div>
          <Field label="Destinație" value={destination} onChange={setDestination} />
          <Field label="Durată (luni)" value={durationMonths} onChange={(value) => setDurationMonths(value.replace(/\D/g, ""))} />
          <Field label="Data începerii" value={startDate} onChange={setStartDate} placeholder="ZZ.LL.AAAA" />
          <Field label="Chirie lunară" value={rent} onChange={(value) => setRent(value.replace(/[^\d.]/g, ""))} />
          <Field label="Monedă" value={currency} onChange={setCurrency} />
          <Field label="Garanție" value={deposit} onChange={(value) => setDeposit(value.replace(/[^\d.]/g, ""))} />
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <PartySection title="1. Proprietar (locator)" party={landlord} onChange={setLandlord} fileRef={landlordFileRef} extractionEnabled={extractionEnabled} extracting={extract.isPending && extractTarget === "landlord"} onFile={(file) => { setExtractTarget("landlord"); extract.mutate({ file, target: "landlord" }); }} />
          <PartySection title="2. Chiriaș (locatar)" party={tenant} onChange={setTenant} fileRef={tenantFileRef} extractionEnabled={extractionEnabled} extracting={extract.isPending && extractTarget === "tenant"} onFile={(file) => { setExtractTarget("tenant"); extract.mutate({ file, target: "tenant" }); }} />
        </div>

        <div className="space-y-4 rounded-md border border-border p-4">
          <div className="flex items-start gap-3"><Checkbox id="include-inventory" checked={includeInventory} onCheckedChange={(checked) => { const next = checked === true; setIncludeInventory(next); if (next && inventory === null) setInventory(defaults.data?.items ?? []); }} /><div><Label htmlFor="include-inventory">Include proces-verbal de predare-primire</Label><p className="text-xs text-muted-foreground">Anexa se include în același PDF și se semnează împreună cu contractul.</p></div></div>
          {includeInventory ? <InventoryEditor items={inventory ?? defaults.data?.items ?? []} onChange={setInventory} /> : null}
        </div>
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