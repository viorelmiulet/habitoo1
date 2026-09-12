import { useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useNavigate } from "@tanstack/react-router";
import { Camera, Loader2, ScanLine, ShieldCheck } from "lucide-react";
import { toast } from "@/components/ui/sonner";
import { toastError } from "@/lib/errors";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import {
  CONTRACT_KINDS,
  contractKindLabels,
  isValidCnp,
  partyRoleLabels,
  type ContractKind,
  type PartyRole,
} from "@/lib/contracts/templates";
import {
  createContract,
  extractIdDocument,
  getIdExtractionStatus,
  listTemplates,
} from "@/lib/contracts.functions";


const defaultRole: Record<ContractKind, PartyRole> = {
  sale_mandate: "seller",
  rent_mandate: "landlord",
  viewing_report: "buyer",
};

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
};

const emptyParty = (role: PartyRole): PartyForm => ({
  role,
  fullName: "",
  email: "",
  phone: "",
  address: "",
  cnp: "",
  idSeries: "",
  idNumber: "",
  idIssuer: "",
  idIssuedOn: "",
  birthDate: "",
});

export function NewContractDialog({
  open,
  onOpenChange,
  propertyId,
  contactId,
}: {
  open: boolean;
  onOpenChange: (value: boolean) => void;
  propertyId?: string;
  contactId?: string;
}) {
  const navigate = useNavigate();
  const fetchTemplates = useServerFn(listTemplates);
  const runCreate = useServerFn(createContract);
  const runExtract = useServerFn(extractIdDocument);
  const fetchExtractionStatus = useServerFn(getIdExtractionStatus);
  const fileRef = useRef<HTMLInputElement>(null);

  const extractionStatus = useQuery({
    queryKey: ["contract-id-extraction-status"],
    queryFn: () => fetchExtractionStatus({}),
    enabled: open,
    staleTime: 5 * 60_000,
  });
  const extractionEnabled = extractionStatus.data?.configured !== false;


  const [kind, setKind] = useState<ContractKind>("sale_mandate");
  const [templateId, setTemplateId] = useState<string>("");
  const [selectedProperty, setSelectedProperty] = useState<string>(propertyId ?? "");
  const [selectedContact, setSelectedContact] = useState<string>(contactId ?? "");
  const [party, setParty] = useState<PartyForm>(emptyParty("seller"));
  const [commission, setCommission] = useState("");
  const [durationDays, setDurationDays] = useState("");

  const templates = useQuery({
    queryKey: ["contract-templates"],
    queryFn: () => fetchTemplates({}),
    enabled: open,
  });

  const properties = useQuery({
    queryKey: ["contract-properties"],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("properties")
        .select("id,title,reference,commission")
        .is("archived_at", null)
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return data;
    },
  });

  const contacts = useQuery({
    queryKey: ["contract-contacts"],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contacts")
        .select("id,first_name,last_name,email,phone")
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return data;
    },
  });

  const kindTemplates = useMemo(
    () => (templates.data ?? []).filter((t) => t.kind === kind),
    [templates.data, kind],
  );
  const activeTemplate = templateId || kindTemplates[0]?.id || "";

  const extract = useMutation({
    mutationFn: async (file: File) => {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error("Nu am putut citi imaginea."));
        reader.readAsDataURL(file);
      });
      return runExtract({
        data: {
          imageBase64: base64,
          mimeType: file.type === "image/jpg" ? "image/jpeg" : file.type,
        },
      });
    },
    onSuccess: (result) => {
      setParty((prev) => ({
        ...prev,
        fullName:
          [result.lastName, result.firstName].filter(Boolean).join(" ").trim() || prev.fullName,
        cnp: result.cnp || prev.cnp,
        idSeries: result.series || prev.idSeries,
        idNumber: result.number || prev.idNumber,
        idIssuer: result.issuer || prev.idIssuer,
        idIssuedOn: result.issuedOn || prev.idIssuedOn,
        address: result.address || prev.address,
        birthDate: result.birthDate || prev.birthDate,
      }));
      if (result.configured === false) {
        void extractionStatus.refetch();
        toast.info(result.failure ?? "Completarea automată nu este configurată.");
      } else if (result.failure) toast.error(result.failure);
      else toast.success("Date completate din act. Verifică-le înainte de a continua.");

    },
    onError: (e: Error) => toastError(e),
  });

  const create = useMutation({
    mutationFn: async () => {
      if (!activeTemplate) throw new Error("Alege un șablon.");
      if (party.fullName.trim().length < 3) throw new Error("Completează numele clientului.");
      if (party.cnp && !isValidCnp(party.cnp)) throw new Error("CNP-ul nu este valid.");
      return runCreate({
        data: {
          templateId: activeTemplate,
          kind,
          propertyId: selectedProperty || undefined,
          contactId: selectedContact || undefined,
          commission: commission.trim() || undefined,
          durationDays: durationDays ? Number(durationDays) : undefined,
          parties: [
            {
              role: party.role,
              fullName: party.fullName.trim(),
              email: party.email.trim(),
              phone: party.phone.trim() || undefined,
              address: party.address.trim() || undefined,
              cnp: party.cnp.trim() || undefined,
              idSeries: party.idSeries.trim() || undefined,
              idNumber: party.idNumber.trim() || undefined,
              idIssuer: party.idIssuer.trim() || undefined,
              idIssuedOn: party.idIssuedOn.trim() || undefined,
              birthDate: party.birthDate.trim() || undefined,
            },
          ],
        },
      });
    },
    onSuccess: ({ id }) => {
      toast.success("Document creat.");
      onOpenChange(false);
      navigate({ to: "/app/contracts/$id", params: { id } });
    },
    onError: (e: Error) => toastError(e),
  });

  const set = (key: keyof PartyForm, value: string) =>
    setParty((prev) => ({ ...prev, [key]: value }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Document nou</DialogTitle>
          <DialogDescription>
            Alege tipul documentului, proprietatea și completează datele clientului. Fotografia
            actului este folosită doar pentru completare automată și nu este salvată.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Tip document</Label>
            <Select
              value={kind}
              onValueChange={(value) => {
                const next = value as ContractKind;
                setKind(next);
                setTemplateId("");
                setParty((prev) => ({ ...prev, role: defaultRole[next] }));
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CONTRACT_KINDS.map((k) => (
                  <SelectItem key={k} value={k}>
                    {contractKindLabels[k]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Șablon</Label>
            <Select value={activeTemplate} onValueChange={setTemplateId}>
              <SelectTrigger>
                <SelectValue placeholder="Alege șablonul" />
              </SelectTrigger>
              <SelectContent>
                {kindTemplates.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name}
                    {t.isPlatform ? " · Habitoo" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Proprietate</Label>
            <Select
              value={selectedProperty || "none"}
              onValueChange={(value) => {
                setSelectedProperty(value === "none" ? "" : value);
                const found = (properties.data ?? []).find((p) => p.id === value);
                if (found?.commission) setCommission(found.commission);
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Fără proprietate" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Fără proprietate</SelectItem>
                {(properties.data ?? []).map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.reference ? `${p.reference} · ` : ""}
                    {p.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Contact din CRM</Label>
            <Select
              value={selectedContact || "none"}
              onValueChange={(value) => {
                setSelectedContact(value === "none" ? "" : value);
                const found = (contacts.data ?? []).find((c) => c.id === value);
                if (found) {
                  setParty((prev) => ({
                    ...prev,
                    fullName:
                      [found.first_name, found.last_name].filter(Boolean).join(" ") ||
                      prev.fullName,
                    email: found.email ?? prev.email,
                    phone: found.phone ?? prev.phone,
                  }));
                }
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Fără contact" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Fără contact</SelectItem>
                {(contacts.data ?? []).map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {[c.first_name, c.last_name].filter(Boolean).join(" ")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-muted/40 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <ScanLine className="size-4 text-primary" /> Completare din actul de identitate
            </div>
            <input
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              capture="environment"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) extract.mutate(file);
                e.target.value = "";
              }}
            />
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => fileRef.current?.click()}
              disabled={extract.isPending || !extractionEnabled}
            >
              {extract.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Camera className="size-4" />
              )}
              {extract.isPending ? "Se citește actul…" : "Fotografiază actul"}
            </Button>
          </div>
          {!extractionEnabled && (
            <p className="mt-2 text-xs text-muted-foreground">
              Completarea automată din act nu este configurată. Introdu datele manual în câmpurile de
              mai jos.
            </p>
          )}
          <p className="mt-2 flex items-start gap-1.5 text-xs text-muted-foreground">
            <ShieldCheck className="mt-0.5 size-3.5 shrink-0" />
            Fotografia nu este salvată. CNP-ul și seria actului se păstrează criptat și sunt
            vizibile doar agentului care întocmește documentul și administratorului agenției.
          </p>

        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Calitatea clientului</Label>
            <Select value={party.role} onValueChange={(v) => set("role", v)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(partyRoleLabels)
                  .filter(([role]) => role !== "agent")
                  .map(([role, label]) => (
                    <SelectItem key={role} value={role}>
                      {label}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
          <Field label="Nume complet" value={party.fullName} onChange={(v) => set("fullName", v)} />
          <Field label="Email" value={party.email} onChange={(v) => set("email", v)} />
          <Field label="Telefon" value={party.phone} onChange={(v) => set("phone", v)} />
          <Field
            label="CNP"
            value={party.cnp}
            onChange={(v) => set("cnp", v.replace(/\D/g, "").slice(0, 13))}
          />
          <Field label="Seria actului" value={party.idSeries} onChange={(v) => set("idSeries", v)} />
          <Field label="Număr act" value={party.idNumber} onChange={(v) => set("idNumber", v)} />
          <Field
            label="Eliberat de"
            value={party.idIssuer}
            onChange={(v) => set("idIssuer", v)}
          />
          <Field
            label="Data eliberării"
            value={party.idIssuedOn}
            onChange={(v) => set("idIssuedOn", v)}
            placeholder="ZZ.LL.AAAA"
          />
          <Field
            label="Data nașterii"
            value={party.birthDate}
            onChange={(v) => set("birthDate", v)}
            placeholder="ZZ.LL.AAAA"
          />
          <Field
            label="Domiciliu"
            value={party.address}
            onChange={(v) => set("address", v)}
            className="sm:col-span-2"
          />
          <Field label="Comision" value={commission} onChange={setCommission} />
          <Field
            label="Durată (zile)"
            value={durationDays}
            onChange={(v) => setDurationDays(v.replace(/\D/g, ""))}
          />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Anulează
          </Button>
          <Button onClick={() => create.mutate()} disabled={create.isPending}>
            {create.isPending ? <Loader2 className="size-4 animate-spin" /> : null} Creează
            documentul
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  className,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}) {
  return (
    <div className={`space-y-1.5 ${className ?? ""}`}>
      <Label>{label}</Label>
      <Input value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}
