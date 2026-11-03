import { useEffect, useMemo, useRef, useState } from "react";
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
import { isValidCnp, type InventoryItem, type PartyRole } from "@/lib/contracts/templates";
import { prepareIdCapture } from "@/lib/contracts/image";
import {
  createContract,
  listTemplates,
} from "@/lib/contracts.functions";
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
import { getContractNumberSeries } from "@/lib/contracts/numbering.functions";
import { getContactIdentity } from "@/lib/contracts/contact-identity.functions";
import { C5Fields } from "./C5Fields";
import {
  buildC5Request,
  C5_PARTY_SLOTS,
  commissionText,
  defaultC5Form,
  isC5Kind,
  type C5Form,
  type C5Kind,
  type C5Target,
} from "@/lib/contracts/c5";

type PartyTarget = "landlord" | "tenant" | "beneficiary" | C5Target;
type DocumentKind = "rent_agreement" | "exclusive_representation" | C5Kind;
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
  citizenship: "romana",
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
  const { data: currentUser } = useCurrentUser();
  const fetchTemplates = useServerFn(listTemplates);
  const fetchNumberSeries = useServerFn(getContractNumberSeries);
  const runCreate = useServerFn(createContract);
  const runRead = useServerFn(readIdDocument);
  const fetchExtractionStatus = useServerFn(getIdReadingStatus);
  const runIdentity = useServerFn(getContactIdentity);
  const [documentKind, setDocumentKind] = useState<DocumentKind>("rent_agreement");
  const c5Kind = isC5Kind(documentKind) ? documentKind : null;
  const [c5Form, setC5Form] = useState<C5Form>(() => defaultC5Form(currentUser?.organization?.city));
  const [c5Parties, setC5Parties] = useState<Record<C5Target, PartyForm>>({
    client: emptyParty("client"),
    lender: emptyParty("lender"),
    borrower: emptyParty("borrower"),
  });
  const agencyCity = currentUser?.organization?.city;
  useEffect(() => {
    if (agencyCity) setC5Form((current) => (current.locality ? current : { ...current, locality: agencyCity }));
  }, [agencyCity]);
  const [c5Contacts, setC5Contacts] = useState<Record<C5Target, string>>({ client: "", lender: "", borrower: "" });
  const [c5Stored, setC5Stored] = useState<Record<C5Target, string | null>>({ client: null, lender: null, borrower: null });
  const [c5Save, setC5Save] = useState<Record<C5Target, boolean>>({ client: false, lender: false, borrower: false });
  const [templateId, setTemplateId] = useState("");
  const [selectedProperty, setSelectedProperty] = useState(propertyId ?? "");
  const [selectedContact, setSelectedContact] = useState(contactId ?? "");
  const [landlord, setLandlord] = useState<PartyForm>(emptyParty("landlord"));
  const [tenant, setTenant] = useState<PartyForm>(emptyParty("tenant"));
  const [beneficiary, setBeneficiary] = useState<PartyForm>(emptyParty("seller"));
  const [idStates, setIdStates] = useState<Record<PartyTarget, PartyIdState>>({
    landlord: emptyPartyIdState,
    tenant: emptyPartyIdState,
    beneficiary: emptyPartyIdState,
    client: emptyPartyIdState,
    lender: emptyPartyIdState,
    borrower: emptyPartyIdState,
  });
  const [backDone, setBackDone] = useState<Record<PartyTarget, boolean>>({
    landlord: false,
    tenant: false,
    beneficiary: false,
    client: false,
    lender: false,
    borrower: false,
  });
  const [reading, setReading] = useState<{ target: PartyTarget; side: CaptureSide } | null>(null);
  const [destination, setDestination] = useState("locuinta");
  const [durationMonths, setDurationMonths] = useState("");
  const [startDate, setStartDate] = useState("");
  const [rent, setRent] = useState("");
  const [currency, setCurrency] = useState("EUR");
  const [deposit, setDeposit] = useState("");
  const [includeInventory, setIncludeInventory] = useState(false);
  const [inventory, setInventory] = useState<InventoryItem[] | null>(null);
  const [commission, setCommission] = useState("3");
  const [negotiable, setNegotiable] = useState<"DA" | "NU">("DA");
  const [exclusiveProperty, setExclusiveProperty] = useState({
    locality: "",
    street: "",
    streetNumber: "",
    county: "",
    rooms: "",
    layout: "",
    floor: "",
    comfort: "",
    bathrooms: "",
    balconies: "",
    usableSurface: "",
    price: "",
    currency: "EUR",
  });

  const templates = useQuery({
    queryKey: ["contract-templates"],
    queryFn: () => fetchTemplates({}),
    enabled: open,
  });
  const numberSeries = useQuery({
    queryKey: ["contract-number-series", currentUser?.organization?.id],
    queryFn: () => fetchNumberSeries(),
    enabled: open,
  });
  const extractionStatus = useQuery({
    queryKey: ["contract-id-extraction-status"],
    queryFn: () => fetchExtractionStatus({}),
    enabled: open,
    staleTime: 300_000,
  });
  const extractionEnabled = extractionStatus.data?.configured !== false;
  const rentalTemplates = useMemo(
    () => (templates.data ?? []).filter((item) => item.kind === "rent_agreement"),
    [templates.data],
  );
  const exclusiveTemplates = useMemo(
    () => (templates.data ?? []).filter((item) => item.kind === "exclusive_representation"),
    [templates.data],
  );
  const c5Templates = useMemo(
    () =>
      (templates.data ?? [])
        .filter((item) => item.kind === documentKind)
        // Șablonul agenției are prioritate față de cel standard Habitoo.
        .sort((a, b) => Number(a.isPlatform) - Number(b.isPlatform)),
    [templates.data, documentKind],
  );
  const kindTemplates = c5Kind
    ? c5Templates
    : documentKind === "rent_agreement"
      ? rentalTemplates
      : exclusiveTemplates;
  const activeTemplate = kindTemplates.some((item) => item.id === templateId)
    ? templateId
    : kindTemplates[0]?.id || "";

  const properties = useQuery({
    queryKey: ["contract-properties"],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("properties")
        .select(
          "id,title,reference,address,city,county,street,street_number,rooms,layout,floor,floor_label,comfort,bathrooms,balconies,usable_surface,surface,price,currency,negotiable,commission,owner_contact_id",
        )
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

  const c5Setter = (target: C5Target) => (next: PartyForm | ((previous: PartyForm) => PartyForm)) =>
    setC5Parties((current) => ({
      ...current,
      [target]: typeof next === "function" ? next(current[target]) : next,
    }));
  const setterFor = (target: PartyTarget) =>
    target === "client" || target === "lender" || target === "borrower"
      ? c5Setter(target)
      : target === "landlord"
        ? setLandlord
        : target === "tenant"
          ? setTenant
          : setBeneficiary;
  const patchIdState = (target: PartyTarget, next: (state: PartyIdState) => PartyIdState) =>
    setIdStates((current) => ({ ...current, [target]: next(current[target]) }));

  /* Poza există doar în memorie pe durata cererii: nu o punem în state și nu o arătăm. */
  const extract = useMutation({
    mutationFn: async ({
      file,
      target,
      side,
    }: {
      file: File;
      target: PartyTarget;
      side: CaptureSide;
    }) => {
      const capture = await prepareIdCapture(file);
      const payload = side === "back" ? { back: capture } : { front: capture };
      return { target, side, result: await runRead({ data: payload }) };
    },
    onSuccess: ({ target, side, result }) => {
      if (result.state === "read") {
        const applied = applyIdReading(
          result.reading,
          result.front,
          result.conflicts,
          idStates[target],
        );
        setterFor(target)((previous) => ({ ...previous, ...applied.values }));
        patchIdState(target, (state) => ({
          ...applied.state,
          verified: [...new Set([...state.verified, ...applied.state.verified])],
          pending: [...new Set([...state.pending, ...applied.state.pending])],
          conflicts: [
            ...state.conflicts.filter(
              (item) => !applied.state.conflicts.some((next) => next.field === item.field),
            ),
            ...applied.state.conflicts,
          ],
          quality: result.messages,
        }));
        if (side === "back") setBackDone((current) => ({ ...current, [target]: true }));
        if (target === "client" || target === "lender" || target === "borrower") {
          // După o scanare în fereastră, salvarea pe fișa clientului e bifată implicit.
          setC5Save((current) => ({ ...current, [target]: true }));
          setC5Stored((current) => ({ ...current, [target]: null }));
        }
        if (result.conflicts.length > 0)
          toast.warning(
            "Fața actului și zona citibilă nu spun același lucru. Alege valoarea corectă.",
          );
        else
          toast.success(
            side === "back"
              ? "Datele verificate au fost completate."
              : "Datele de pe față au fost completate. Confirmă-le.",
          );
        return;
      }
      if (result.state === "needs_better_photo") {
        patchIdState(target, (state) => ({ ...state, quality: result.messages }));
        return;
      }
      patchIdState(target, (state) => ({ ...state, quality: [result.message] }));
    },
    onError: (error: Error) => toast.error(error.message, { duration: 9000 }),
  });

  const chooseConflict = (
    target: PartyTarget,
    conflict: IdFieldConflict,
    source: "mrz" | "vision",
  ) => {
    if (source === "vision") {
      const value = conflict.vision;
      setterFor(target)((previous) => {
        if (conflict.field === "series" || conflict.field === "documentNumber") {
          const clean = value.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
          const letters = /[A-Z]{2}/.exec(clean)?.[0] ?? previous.idSeries;
          const digits = /[0-9]{6}/.exec(clean)?.[0] ?? previous.idNumber;
          return { ...previous, idSeries: letters, idNumber: digits };
        }
        return { ...previous, fullName: value };
      });
    }
    patchIdState(target, (state) => resolveConflict(state, conflict.field));
  };

  const activeParties: { label: string; target: PartyTarget; state: PartyIdState }[] = c5Kind
    ? C5_PARTY_SLOTS[c5Kind].map((slot) => ({ label: slot.label, target: slot.target, state: idStates[slot.target] }))
    : documentKind === "rent_agreement"
      ? [
          { label: "Proprietar", target: "landlord", state: idStates.landlord },
          { label: "Chiriaș", target: "tenant", state: idStates.tenant },
        ]
      : [{ label: "Beneficiar", target: "beneficiary", state: idStates.beneficiary }];
  const blockers = idGenerationBlockers(activeParties);

  const agentParty = (): PartyForm => ({
    ...emptyParty("agent"),
    fullName:
      currentUser?.profile?.full_name ||
      currentUser?.organization?.legal_representative ||
      currentUser?.organization?.name ||
      "Reprezentant agenție",
    email: currentUser?.email || "",
  });
  const partyPayload = (party: PartyForm) => ({
    ...party,
    email: party.email.trim(),
    phone: party.phone.trim() || undefined,
    address: party.address.trim() || undefined,
    cnp: party.cnp.trim() || undefined,
    idSeries: party.idSeries.trim() || undefined,
    idNumber: party.idNumber.trim() || undefined,
    idIssuer: party.idIssuer.trim() || undefined,
    idIssuedOn: party.idIssuedOn.trim() || undefined,
    birthDate: party.birthDate.trim() || undefined,
    citizenship: party.citizenship.trim() || undefined,
  });
  const create = useMutation({
    mutationFn: async () => {
      if (!activeTemplate) throw new Error("Șablonul documentului nu este disponibil.");
      if (c5Kind) {
        const withMeta = Object.fromEntries(
          (Object.keys(c5Parties) as C5Target[]).map((target) => [
            target,
            {
              ...partyPayload(c5Parties[target]),
              contactId: c5Contacts[target] || undefined,
              saveIdentity: Boolean(c5Contacts[target]) && c5Save[target],
            },
          ]),
        ) as Record<C5Target, ReturnType<typeof partyPayload> & { contactId?: string; saveIdentity?: boolean }>;
        for (const party of Object.values(withMeta))
          if (party.cnp && !isValidCnp(party.cnp))
            throw new Error(`CNP-ul pentru ${party.fullName} nu este valid.`);
        const request = buildC5Request(c5Kind, c5Form, withMeta, partyPayload(agentParty()));
        return runCreate({
          data: {
            templateId: activeTemplate,
            propertyId: selectedProperty || undefined,
            contactId: c5Contacts.client || undefined,
            ...request,
          },
        });
      }
      const clientParties = documentKind === "rent_agreement" ? [landlord, tenant] : [beneficiary];
      if (clientParties.some((party) => party.fullName.trim().length < 3))
        throw new Error("Completează numele tuturor părților.");
      for (const party of clientParties)
        if (party.cnp && !isValidCnp(party.cnp))
          throw new Error(`CNP-ul pentru ${party.fullName} nu este valid.`);
      const cleanInventory = (inventory ?? []).filter((item) =>
        item.name.trim(),
      );
      const parties =
        documentKind === "rent_agreement"
          ? [landlord, tenant]
          : [
              {
                ...emptyParty("agent"),
                fullName:
                  currentUser?.profile?.full_name ||
                  currentUser?.organization?.legal_representative ||
                  currentUser?.organization?.name ||
                  "Reprezentant agenție",
                email: currentUser?.email || "",
              },
              beneficiary,
            ];
      return runCreate({
        data: {
          templateId: activeTemplate,
          kind: documentKind,
          propertyId: selectedProperty || undefined,
          contactId: selectedContact || undefined,
          price:
            documentKind === "exclusive_representation"
              ? exclusiveProperty.price
                ? Number(exclusiveProperty.price)
                : undefined
              : rent
                ? Number(rent)
                : undefined,
          currency:
            documentKind === "exclusive_representation" ? exclusiveProperty.currency : currency,
          durationMonths: durationMonths
            ? Number(durationMonths)
            : documentKind === "exclusive_representation"
              ? 6
              : undefined,
          startDate: startDate || undefined,
          destination: destination.trim() || undefined,
          deposit: deposit ? Number(deposit) : undefined,
          includeInventory: documentKind === "rent_agreement" && includeInventory,
          inventory: includeInventory ? cleanInventory : undefined,
          commission: documentKind === "exclusive_representation" ? commission : undefined,
          negotiable: documentKind === "exclusive_representation" ? negotiable : undefined,
          exclusiveProperty:
            documentKind === "exclusive_representation" ? exclusiveProperty : undefined,
          parties: parties.map((party) => ({
            ...party,
            email: party.email.trim(),
            phone: party.phone.trim() || undefined,
            address: party.address.trim() || undefined,
            cnp: party.cnp.trim() || undefined,
            idSeries: party.idSeries.trim() || undefined,
            idNumber: party.idNumber.trim() || undefined,
            idIssuer: party.idIssuer.trim() || undefined,
            idIssuedOn: party.idIssuedOn.trim() || undefined,
            birthDate: party.birthDate.trim() || undefined,
            citizenship: party.citizenship.trim() || undefined,
          })),
        },
      });
    },
    onSuccess: ({ id }) => {
      toast.success("Contract creat.");
      onOpenChange(false);
      navigate({ to: "/app/contracts/$id", params: { id } });
    },
    onError: (error: Error) => toastError(error),
  });

  const selectC5Contact = async (target: C5Target, value: string) => {
    const contactId = value === "none" ? "" : value;
    setC5Contacts((current) => ({ ...current, [target]: contactId }));
    setC5Save((current) => ({ ...current, [target]: false }));
    setC5Stored((current) => ({ ...current, [target]: null }));
    const found = contacts.data?.find((contact) => contact.id === contactId);
    if (!found) return;
    c5Setter(target)((previous) => ({
      ...previous,
      fullName: [found.first_name, found.last_name].filter(Boolean).join(" ") || previous.fullName,
      email: found.email ?? previous.email,
      phone: found.phone ?? previous.phone,
    }));
    try {
      // Serverul verifică accesul (admin agenție / agent responsabil) și întoarce doar date mascate.
      const identity = await runIdentity({ data: { contactId } });
      if (!identity) return;
      c5Setter(target)((previous) => ({
        ...previous,
        fullName: identity.full_name || previous.fullName,
        address: identity.address ?? previous.address,
        citizenship: identity.citizenship ?? previous.citizenship,
        idIssuer: identity.id_issuer ?? previous.idIssuer,
        idIssuedOn: identity.id_issued_on ?? previous.idIssuedOn,
        birthDate: identity.birth_date ?? previous.birthDate,
        cnp: "",
        idSeries: "",
        idNumber: "",
      }));
      setC5Stored((current) => ({
        ...current,
        [target]: `Date din fișa clientului: CNP ${identity.cnp ?? "—"}, seria ${identity.idSeries ?? "—"} nr. ${identity.idNumber ?? "—"}. Se completează automat la creare.`,
      }));
    } catch {
      /* Fără acces la identitate: rămân doar datele de contact. */
    }
  };

  const selectContact = (value: string) => {
    setSelectedContact(value === "none" ? "" : value);
    const found = contacts.data?.find((contact) => contact.id === value);
    if (found) {
      const setter = documentKind === "rent_agreement" ? setTenant : setBeneficiary;
      setter((previous) => ({
        ...previous,
        fullName:
          [found.first_name, found.last_name].filter(Boolean).join(" ") || previous.fullName,
        email: found.email ?? previous.email,
        phone: found.phone ?? previous.phone,
      }));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-5xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Document nou</DialogTitle>
          <DialogDescription>
            Alege documentul, completează datele și verifică informațiile citite din act.
          </DialogDescription>
        </DialogHeader>
        {(documentKind === "exclusive_representation" || documentKind === "commission" || documentKind === "viewing") && numberSeries.isSuccess && !numberSeries.data.some((row) => row.kind === documentKind && row.series) ? (
          <p className="text-sm text-muted-foreground">Setează seria în Setări → Numerotare contracte</p>
        ) : null}
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Tip document</Label>
            <Select
              value={documentKind}
              onValueChange={(value) => {
                setDocumentKind(value as typeof documentKind);
                setTemplateId("");
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="rent_agreement">Contract de închiriere</SelectItem>
                <SelectItem value="exclusive_representation">
                  Contract de reprezentare exclusivă
                </SelectItem>
                <SelectItem value="commission">Contract de comision</SelectItem>
                <SelectItem value="loan_for_use">Contract de comodat</SelectItem>
                <SelectItem value="viewing">Contract de vizionare</SelectItem>
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
                {kindTemplates.map((item) => (
                  <SelectItem key={item.id} value={item.id}>
                    {item.name}
                    {item.isPlatform ? " · Habitoo" : ""}
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
                const found = properties.data?.find((property) => property.id === value);
                if (found && c5Kind) {
                  setC5Form((current) => ({
                    ...current,
                    commission: commissionText(found.commission, current.transactionType) || current.commission,
                    propertyAddress:
                      [found.address, found.city, found.county].filter(Boolean).join(", ") ||
                      current.propertyAddress,
                  }));
                } else if (found) {
                  setRent(found.price ? String(found.price) : "");
                  setCurrency(found.currency ?? "EUR");
                  setCommission(found.commission ?? "3");
                  setNegotiable(found.negotiable ? "DA" : "NU");
                  setExclusiveProperty({
                    locality: found.city ?? "",
                    street: found.street ?? "",
                    streetNumber: found.street_number ?? "",
                    county: found.county ?? "",
                    rooms: found.rooms == null ? "" : String(found.rooms),
                    layout: found.layout ?? "",
                    floor: found.floor_label ?? (found.floor == null ? "" : String(found.floor)),
                    comfort: found.comfort ?? "",
                    bathrooms: found.bathrooms == null ? "" : String(found.bathrooms),
                    balconies: found.balconies == null ? "" : String(found.balconies),
                    usableSurface:
                      found.usable_surface == null
                        ? found.surface == null
                          ? ""
                          : String(found.surface)
                        : String(found.usable_surface),
                    price: found.price == null ? "" : String(found.price),
                    currency: found.currency ?? "EUR",
                  });
                  if (found.owner_contact_id) {
                    setSelectedContact(found.owner_contact_id);
                    selectContact(found.owner_contact_id);
                  }
                }
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Alege proprietatea" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Fără proprietate</SelectItem>
                {properties.data?.map((property) => (
                  <SelectItem key={property.id} value={property.id}>
                    {property.reference ? `${property.reference} · ` : ""}
                    {property.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {c5Kind ? null : (
          <div className="space-y-1.5">
            <Label>{documentKind === "rent_agreement" ? "Chiriaș" : "Beneficiar"} din CRM</Label>
            <Select value={selectedContact || "none"} onValueChange={selectContact}>
              <SelectTrigger>
                <SelectValue placeholder="Fără contact" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Fără contact</SelectItem>
                {contacts.data?.map((contact) => (
                  <SelectItem key={contact.id} value={contact.id}>
                    {[contact.first_name, contact.last_name].filter(Boolean).join(" ")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          )}
          {c5Kind ? null : documentKind === "exclusive_representation" ? (
            <>
              <Field label="Comision (%)" value={commission} onChange={setCommission} />
              <Field
                label="Durată (luni)"
                value={durationMonths || "6"}
                onChange={(value) => setDurationMonths(value.replace(/\D/g, ""))}
              />
              <div className="space-y-1.5">
                <Label>Negociabil</Label>
                <Select
                  value={negotiable}
                  onValueChange={(value) => setNegotiable(value as "DA" | "NU")}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="DA">DA</SelectItem>
                    <SelectItem value="NU">NU</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </>
          ) : (
            <>
              <Field label="Destinație" value={destination} onChange={setDestination} />
              <Field
                label="Durată (luni)"
                value={durationMonths}
                onChange={(value) => setDurationMonths(value.replace(/\D/g, ""))}
              />
              <Field
                label="Data începerii"
                value={startDate}
                onChange={setStartDate}
                placeholder="ZZ.LL.AAAA"
              />
              <Field
                label="Chirie lunară"
                value={rent}
                onChange={(value) => setRent(value.replace(/[^\d.]/g, ""))}
              />
              <Field label="Monedă" value={currency} onChange={setCurrency} />
              <Field
                label="Garanție"
                value={deposit}
                onChange={(value) => setDeposit(value.replace(/[^\d.]/g, ""))}
              />
            </>
          )}
        </div>

        {c5Kind ? (
          <>
            <C5Fields
              kind={c5Kind}
              form={c5Form}
              onChange={setC5Form}
              properties={(properties.data ?? []).map((p) => ({
                id: p.id,
                label: `${p.reference ? `${p.reference} · ` : ""}${p.title ?? ""}`,
              }))}
            />
            <div className="grid gap-4 lg:grid-cols-2">
              {C5_PARTY_SLOTS[c5Kind].map((slot, index) => (
                <div key={slot.target} className="space-y-3">
                  <div className="space-y-1.5">
                    <Label>{slot.label}: alege din CRM</Label>
                    <Select
                      value={c5Contacts[slot.target] || "none"}
                      onValueChange={(value) => void selectC5Contact(slot.target, value)}
                    >
                      <SelectTrigger aria-label={`${slot.label} din CRM`}>
                        <SelectValue placeholder="Fără contact" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Fără contact</SelectItem>
                        {contacts.data?.map((contact) => (
                          <SelectItem key={contact.id} value={contact.id}>
                            {[contact.first_name, contact.last_name].filter(Boolean).join(" ")}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  {c5Stored[slot.target] ? (
                    <p className="flex items-start gap-1.5 rounded-md border border-border bg-muted/40 p-2 text-xs text-muted-foreground">
                      <ShieldCheck className="mt-0.5 size-3.5 shrink-0" />
                      {c5Stored[slot.target]}
                    </p>
                  ) : null}
                  <PartySection
                    title={`${index + 1}. ${slot.label}`}
                    party={c5Parties[slot.target]}
                    onChange={c5Setter(slot.target)}
                    idState={idStates[slot.target]}
                    backDone={backDone[slot.target]}
                    extractionEnabled={extractionEnabled}
                    reading={extract.isPending && reading?.target === slot.target ? reading.side : null}
                    onCapture={(file, side) => {
                      setReading({ target: slot.target, side });
                      extract.mutate({ file, target: slot.target, side });
                    }}
                    onConfirm={() => patchIdState(slot.target, confirmPendingFields)}
                    onChoose={(conflict, source) => chooseConflict(slot.target, conflict, source)}
                  />
                  {c5Contacts[slot.target] &&
                  (backDone[slot.target] || idStates[slot.target].verified.length > 0 || idStates[slot.target].pending.length > 0) ? (
                    <div className="flex items-center gap-2">
                      <Checkbox
                        id={`save-identity-${slot.target}`}
                        checked={c5Save[slot.target]}
                        onCheckedChange={(checked) =>
                          setC5Save((current) => ({ ...current, [slot.target]: checked === true }))
                        }
                      />
                      <Label htmlFor={`save-identity-${slot.target}`} className="text-xs">
                        Salvează datele și pe fișa clientului
                      </Label>
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          </>
        ) : documentKind === "rent_agreement" ? (
          <div className="grid gap-4 lg:grid-cols-2">
            <PartySection
              title="1. Proprietar (locator)"
              party={landlord}
              onChange={setLandlord}
              idState={idStates.landlord}
              backDone={backDone.landlord}
              extractionEnabled={extractionEnabled}
              reading={extract.isPending && reading?.target === "landlord" ? reading.side : null}
              onCapture={(file, side) => {
                setReading({ target: "landlord", side });
                extract.mutate({ file, target: "landlord", side });
              }}
              onConfirm={() => patchIdState("landlord", confirmPendingFields)}
              onChoose={(conflict, source) => chooseConflict("landlord", conflict, source)}
            />
            <PartySection
              title="2. Chiriaș (locatar)"
              party={tenant}
              onChange={setTenant}
              idState={idStates.tenant}
              backDone={backDone.tenant}
              extractionEnabled={extractionEnabled}
              reading={extract.isPending && reading?.target === "tenant" ? reading.side : null}
              onCapture={(file, side) => {
                setReading({ target: "tenant", side });
                extract.mutate({ file, target: "tenant", side });
              }}
              onConfirm={() => patchIdState("tenant", confirmPendingFields)}
              onChoose={(conflict, source) => chooseConflict("tenant", conflict, source)}
            />
          </div>
        ) : (
          <>
            <div className="grid gap-3 rounded-md border border-border p-4 sm:grid-cols-3">
              <h3 className="sm:col-span-3 text-sm font-semibold">Date proprietate (editabile)</h3>
              {Object.entries(exclusiveProperty).map(([key, value]) => (
                <Field
                  key={key}
                  label={
                    (
                      {
                        locality: "Localitate",
                        street: "Stradă",
                        streetNumber: "Număr",
                        county: "Județ",
                        rooms: "Camere",
                        layout: "Compartimentare",
                        floor: "Etaj",
                        comfort: "Confort",
                        bathrooms: "Băi",
                        balconies: "Balcoane",
                        usableSurface: "Suprafață utilă",
                        price: "Preț",
                        currency: "Monedă",
                      } as Record<string, string>
                    )[key] ?? key
                  }
                  value={value}
                  onChange={(next) =>
                    setExclusiveProperty((current) => ({ ...current, [key]: next }))
                  }
                />
              ))}
            </div>
            <PartySection
              title="Beneficiar"
              party={beneficiary}
              onChange={setBeneficiary}
              idState={idStates.beneficiary}
              backDone={backDone.beneficiary}
              extractionEnabled={extractionEnabled}
              reading={extract.isPending && reading?.target === "beneficiary" ? reading.side : null}
              onCapture={(file, side) => {
                setReading({ target: "beneficiary", side });
                extract.mutate({ file, target: "beneficiary", side });
              }}
              onConfirm={() => patchIdState("beneficiary", confirmPendingFields)}
              onChoose={(conflict, source) => chooseConflict("beneficiary", conflict, source)}
            />
          </>
        )}

        {documentKind === "rent_agreement" ? (
          <div className="space-y-4 rounded-md border border-border p-4">
            <div className="flex items-start gap-3">
              <Checkbox
                id="include-inventory"
                checked={includeInventory}
                onCheckedChange={(checked) => {
                  const next = checked === true;
                  setIncludeInventory(next);
                  if (next && inventory === null) setInventory([]);
                }}
              />
              <div>
                <Label htmlFor="include-inventory">Include proces-verbal de predare-primire</Label>
                <p className="text-xs text-muted-foreground">
                  Anexa se include în același PDF și se semnează împreună cu contractul.
                </p>
              </div>
            </div>
            {includeInventory ? (
              <InventoryEditor
                items={inventory ?? []}
                onChange={setInventory}
              />
            ) : null}
          </div>
        ) : null}
        {blockers.length > 0 ? (
          <ul className="space-y-1 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-foreground">
            {blockers.map((item) => (
              <li key={item} className="flex items-start gap-1.5">
                <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                {item}
              </li>
            ))}
          </ul>
        ) : null}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Anulează
          </Button>
          <Button
            onClick={() => create.mutate()}
            disabled={create.isPending || blockers.length > 0}
          >
            {create.isPending ? <Loader2 className="size-4 animate-spin" /> : null} Creează
            contractul
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const FRAMING_HINT: Record<CaptureSide, string> = {
  back: "Fotografiază spatele actului: cele trei rânduri de jos trebuie să intre complet în cadru, drept, fără reflexii.",
  front: "Fotografiază fața actului: tot cardul în cadru, cu textul lizibil.",
};

function PartySection({
  title,
  party,
  onChange,
  idState,
  backDone,
  extractionEnabled,
  reading,
  onCapture,
  onConfirm,
  onChoose,
}: {
  title: string;
  party: PartyForm;
  onChange: (party: PartyForm) => void;
  idState: PartyIdState;
  backDone: boolean;
  extractionEnabled: boolean;
  reading: CaptureSide | null;
  onCapture: (file: File, side: CaptureSide) => void;
  onConfirm: () => void;
  onChoose: (conflict: IdFieldConflict, source: "mrz" | "vision") => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [side, setSide] = useState<CaptureSide>("back");
  const set = (key: keyof PartyForm, value: string) => onChange({ ...party, [key]: value });
  const pick = (next: CaptureSide) => {
    setSide(next);
    inputRef.current?.click();
  };
  const badge = (key: IdFormKey) =>
    idState.verified.includes(key) ? "verified" : idState.pending.includes(key) ? "pending" : null;
  const warningFor = (key: IdFormKey) => {
    if (key === "idSeries" && idState.warnings.includes("series_pair_unknown"))
      return idWarningMessage("series_pair_unknown");
    if (key === "idIssuedOn" && idState.warnings.includes("document_expired"))
      return idWarningMessage("document_expired");
    return undefined;
  };
  return (
    <section className="space-y-4 rounded-md border border-border p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">{title}</h3>
        <input
          ref={inputRef}
          type="file"
          accept="image/*,application/pdf"
          capture="environment"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) onCapture(file, side);
            event.target.value = "";
          }}
        />
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            variant={backDone ? "outline" : "default"}
            onClick={() => pick("back")}
            disabled={reading !== null || !extractionEnabled}
          >
            {reading === "back" ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Camera className="size-4" />
            )}{" "}
            {backDone ? "Refotografiază spatele" : "1. Spatele actului"}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => pick("front")}
            disabled={reading !== null || !extractionEnabled}
          >
            {reading === "front" ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Camera className="size-4" />
            )}{" "}
            2. Fața actului (opțional)
          </Button>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        {FRAMING_HINT[reading ?? (backDone ? "front" : "back")]}
      </p>
      <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
        <ShieldCheck className="mt-0.5 size-3.5 shrink-0" />
        Fotografia nu este salvată nicăieri. Verifică datele completate.
      </p>
      {idState.quality.length > 0 ? (
        <div className="space-y-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-xs">
          <ul className="space-y-1">
            {idState.quality.map((message) => (
              <li key={message}>{message}</li>
            ))}
          </ul>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => pick(backDone ? "front" : "back")}
            disabled={reading !== null}
          >
            <RotateCcw className="size-3.5" /> Încearcă din nou
          </Button>
        </div>
      ) : null}
      {idState.conflicts.length > 0 ? (
        <div className="space-y-2 rounded-md border border-amber-500/50 bg-amber-500/10 p-3 text-xs">
          <p className="font-medium">
            Fața actului și zona citibilă spun altceva. Alege valoarea corectă:
          </p>
          {idState.conflicts.map((conflict) => (
            <div key={conflict.field} className="flex flex-wrap items-center gap-2">
              <span className="font-medium">{conflictLabel(conflict.field)}:</span>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => onChoose(conflict, "mrz")}
              >
                Zona citibilă: {conflict.mrz}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => onChoose(conflict, "vision")}
              >
                Fața actului: {conflict.vision}
              </Button>
            </div>
          ))}
        </div>
      ) : null}
      {idState.pending.length > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-muted/40 p-3 text-xs">
          <span>
            Datele citite de pe fața actului nu au cifră de control. Verifică-le, apoi confirmă.
          </span>
          <Button type="button" size="sm" onClick={onConfirm}>
            <CheckCircle2 className="size-3.5" /> Confirm datele de pe față
          </Button>
        </div>
      ) : null}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field
          label="Nume complet"
          value={party.fullName}
          onChange={(value) => set("fullName", value)}
          className="sm:col-span-2"
          badge={badge("fullName")}
        />
        <Field
          label="CNP"
          value={party.cnp}
          onChange={(value) => set("cnp", value.replace(/\D/g, "").slice(0, 13))}
          badge={badge("cnp")}
        />
        <Field
          label="Cetățenie"
          value={party.citizenship}
          onChange={(value) => set("citizenship", value)}
        />
        <Field
          label="Serie act"
          value={party.idSeries}
          onChange={(value) => set("idSeries", value)}
          badge={badge("idSeries")}
          warning={warningFor("idSeries")}
        />
        <Field
          label="Număr act"
          value={party.idNumber}
          onChange={(value) => set("idNumber", value)}
          badge={badge("idNumber")}
        />
        <Field
          label="Eliberat de"
          value={party.idIssuer}
          onChange={(value) => set("idIssuer", value)}
          badge={badge("idIssuer")}
        />
        <Field
          label="Data eliberării"
          value={party.idIssuedOn}
          onChange={(value) => set("idIssuedOn", value)}
          placeholder="ZZ.LL.AAAA"
          badge={badge("idIssuedOn")}
          warning={warningFor("idIssuedOn")}
        />
        <Field
          label="Data nașterii"
          value={party.birthDate}
          onChange={(value) => set("birthDate", value)}
          placeholder="ZZ.LL.AAAA"
          badge={badge("birthDate")}
        />
        <Field
          label="Domiciliu"
          value={party.address}
          onChange={(value) => set("address", value)}
          className="sm:col-span-2"
          badge={badge("address")}
        />
        <Field label="Email" value={party.email} onChange={(value) => set("email", value)} />
        <Field label="Telefon" value={party.phone} onChange={(value) => set("phone", value)} />
      </div>
    </section>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  className,
  badge,
  warning,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  badge?: "verified" | "pending" | null;
  warning?: string;
}) {
  return (
    <div className={`space-y-1.5 ${className ?? ""}`}>
      <div className="flex flex-wrap items-center gap-2">
        <Label>{label}</Label>
        {badge === "verified" ? (
          <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-medium text-emerald-700 dark:text-emerald-400">
            verificat
          </span>
        ) : null}
        {badge === "pending" ? (
          <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-400">
            de confirmat
          </span>
        ) : null}
      </div>
      <Input
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
      />
      {warning ? (
        <p className="flex items-start gap-1.5 text-[11px] text-amber-700 dark:text-amber-400">
          <AlertTriangle className="mt-0.5 size-3 shrink-0" />
          {warning}
        </p>
      ) : null}
    </div>
  );
}
