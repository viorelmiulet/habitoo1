import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, Camera, IdCard, PencilLine } from "lucide-react";
import { toast } from "@/components/ui/sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { getContactIdentity, saveContactIdentity } from "@/lib/contracts/contact-identity.functions";
import { scanContactIdentity } from "@/lib/contracts/identity-scan.functions";
import { prepareIdCapture } from "@/lib/contracts/image";
import { formatDate } from "@/lib/format";
import { IdScanPanel } from "@/components/app/contracts/IdScanPanel";
import {
  SCAN_DOC_TYPES,
  SCAN_DOC_TYPE_LABELS,
  SCAN_FLAG_LABELS,
  cnpChecks,
  type ScanDocType,
  type ScanFieldName,
  type ScanResult,
} from "@/lib/contracts/id/scan";

const MAX_FILE_BYTES = 10 * 1024 * 1024;

const FIELD_LABELS: Record<ScanFieldName, string> = {
  last_name: "Nume", first_name: "Prenume", cnp: "CNP", birth_date: "Data nașterii",
  birth_place: "Locul nașterii", sex: "Sex (M/F)", nationality: "Cetățenie",
  doc_series: "Seria", doc_number: "Numărul", issued_by: "Emis de",
  issued_at: "Data eliberării", expires_at: "Data expirării", address: "Domiciliul",
};
const DATE_FIELDS = new Set<ScanFieldName>(["birth_date", "issued_at", "expires_at"]);
const ORDER: ScanFieldName[] = [
  "last_name", "first_name", "cnp", "birth_date", "birth_place", "sex", "nationality",
  "doc_series", "doc_number", "issued_by", "issued_at", "expires_at", "address",
];

type Values = Record<ScanFieldName, string>;
const emptyValues = (): Values => Object.fromEntries(ORDER.map((k) => [k, ""])) as Values;

type Draft = {
  mode: "scan" | "manual";
  docType: ScanDocType;
  values: Values;
  flags: Partial<Record<ScanFieldName, string[]>>;
  addressSource: "act" | "certificat_domiciliu" | "manual";
  extractedAt: string | null;
  warnings: string[];
};

export function ContactIdentitySection({ contactId, firstName, lastName }: { contactId: string; firstName: string; lastName: string }) {
  const qc = useQueryClient();
  const fetchIdentity = useServerFn(getContactIdentity);
  const scan = useServerFn(scanContactIdentity);
  const save = useServerFn(saveContactIdentity);
  const identity = useQuery({
    queryKey: ["contact-identity", contactId],
    queryFn: () => fetchIdentity({ data: { contactId } }),
    retry: false,
  });

  const [scanOpen, setScanOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [nameChoice, setNameChoice] = useState<"keep" | "act">("keep");
  const certInput = useRef<HTMLInputElement>(null);

  /* Fără acces (nu e admin sau agent responsabil): secțiunea nu apare. */
  if (identity.isError || identity.data?.canAccessIdentity === false) return null;
  const row = identity.data?.identity ?? null;

  function openDraft(result: ScanResult) {
    const values = emptyValues();
    const flags: Draft["flags"] = {};
    for (const k of ORDER) {
      values[k] = result.fields[k].value ?? "";
      if (result.fields[k].flags.length) flags[k] = result.fields[k].flags;
    }
    setNameChoice("keep");
    setDraft({
      mode: "scan", docType: result.docType, values, flags,
      addressSource: result.addressSource ?? "manual",
      extractedAt: new Date().toISOString(), warnings: result.warnings,
    });
  }

  function openManual() {
    const values = emptyValues();
    if (row) {
      const [last = "", ...rest] = (row.full_name ?? "").split(" ");
      values.last_name = last; values.first_name = rest.join(" ");
      values.birth_date = row.birth_date ?? ""; values.birth_place = row.birth_place ?? "";
      values.sex = row.sex ?? ""; values.nationality = row.citizenship ?? "";
      values.issued_by = row.id_issuer ?? ""; values.issued_at = row.id_issued_on ?? "";
      values.expires_at = row.expires_at ?? ""; values.address = row.address ?? "";
    } else {
      values.last_name = lastName; values.first_name = firstName;
    }
    setNameChoice("keep");
    setDraft({
      mode: "manual", docType: (row?.doc_type as ScanDocType) ?? "ci", values, flags: {},
      addressSource: "manual", extractedAt: null, warnings: [],
    });
  }

  function setValue(k: ScanFieldName, v: string) {
    if (!draft) return;
    const flags = { ...draft.flags, [k]: (draft.flags[k] ?? []).filter((f) => f !== "low_confidence") };
    const next = { ...draft.values, [k]: v };
    const cnpFlags = cnpChecks(next.cnp || null, next.birth_date || null, next.sex || null);
    flags.cnp = [...(flags.cnp ?? []).filter((f) => !f.startsWith("cnp_")), ...cnpFlags];
    if (k === "address") flags.address = v ? [] : flags.address;
    setDraft({ ...draft, values: next, flags, addressSource: k === "address" && draft.mode === "scan" && draft.addressSource !== "certificat_domiciliu" ? "manual" : draft.addressSource });
  }

  const actName = draft ? { first: draft.values.first_name.trim(), last: draft.values.last_name.trim() } : null;
  const contactNameEmpty = !firstName.trim() && !lastName.trim();
  const nameDiffers = Boolean(actName && actName.first && actName.last && !contactNameEmpty
    && `${actName.last} ${actName.first}`.toLowerCase() !== `${lastName} ${firstName}`.trim().toLowerCase());
  const needsAddress = draft?.docType === "cei" && !draft.values.address.trim();

  async function confirm() {
    if (!draft) return;
    const v = draft.values;
    const fullName = `${v.last_name} ${v.first_name}`.trim();
    if (fullName.length < 3) { toast.error("Completează numele și prenumele."); return; }
    if (v.cnp && !/^\d{13}$/.test(v.cnp)) { toast.error("CNP-ul trebuie să aibă 13 cifre."); return; }
    if (needsAddress) { toast.error("La buletinul cu cip adaugă certificatul de domiciliu sau completează manual domiciliul."); return; }
    setBusy(true);
    try {
      const date = (s: string) => (/^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null);
      const useActName = actName?.first && actName.last && (contactNameEmpty || (nameDiffers && nameChoice === "act"));
      await save({
        data: {
          contactId, doc_type: draft.docType, full_name: fullName,
          birth_date: date(v.birth_date), birth_place: v.birth_place || null, citizenship: v.nationality || null,
          sex: v.sex || null, cnp: v.cnp || undefined, idSeries: v.doc_series || undefined, idNumber: v.doc_number || undefined,
          id_issuer: v.issued_by || null, id_issued_on: date(v.issued_at), expires_at: date(v.expires_at),
          address: v.address || null, address_source: draft.addressSource, extracted_at: draft.extractedAt,
          ...(useActName ? { contactName: { first_name: actName!.first, last_name: actName!.last } } : {}),
        },
      });
      toast.success("Datele actului au fost confirmate.");
      setDraft(null);
      await qc.invalidateQueries({ queryKey: ["contact-identity", contactId] });
      if (useActName) await qc.invalidateQueries();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Datele nu au putut fi salvate.");
    } finally {
      setBusy(false);
    }
  }

  const expired = row?.expires_at ? row.expires_at < new Date().toISOString().slice(0, 10) : false;

  return (
    <section className="rounded-[14px] border border-border bg-card p-5" aria-labelledby="contact-identity-title">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="contact-identity-title" className="flex items-center gap-2 text-base font-semibold">
          <IdCard className="size-4" aria-hidden /> Act de identitate
        </h2>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={() => setScanOpen(true)}>
            <Camera className="size-4" aria-hidden /> Scanează actul
          </Button>
          <Button size="sm" variant="outline" onClick={openManual}>
            <PencilLine className="size-4" aria-hidden /> Completează manual
          </Button>
        </div>
      </div>
      {identity.isLoading ? (
        <p className="mt-3 text-sm text-muted-foreground">Se încarcă…</p>
      ) : !row ? (
        <p className="mt-3 text-sm text-muted-foreground">Nu există încă date din actul de identitate.</p>
      ) : (
        <dl className="mt-3 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2 lg:grid-cols-3">
          <Item label="Tip act" value={SCAN_DOC_TYPE_LABELS[row.doc_type as ScanDocType] ?? row.doc_type} />
          <Item label="Nume" value={row.full_name} />
          <Item label="CNP" value={row.cnp} />
          <Item label="Seria și numărul" value={`${row.idSeries ?? "—"} ${row.idNumber ?? ""}`.trim()} />
          <Item label="Expiră" value={row.expires_at ? formatDate(row.expires_at) : "—"} warn={expired ? "Act expirat" : undefined} />
          <Item label="Domiciliu" value={row.address ?? "—"} />
        </dl>
      )}

      <Dialog open={scanOpen} onOpenChange={setScanOpen}>
        <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto">
          <DialogHeader><DialogTitle>Scanează actul</DialogTitle></DialogHeader>
          <IdScanPanel contactId={contactId} idPrefix="contact-id-scan" onResult={(result) => { openDraft(result); setScanOpen(false); }} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setScanOpen(false)}>Renunță</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(draft)} onOpenChange={(o) => !busy && !o && setDraft(null)}>
        <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-2xl">
          <DialogHeader><DialogTitle>{draft?.mode === "scan" ? "Verifică datele citite" : "Completează datele actului"}</DialogTitle></DialogHeader>
          {draft ? (
            <div className="space-y-4 text-sm">
              {draft.mode === "scan" ? <p className="text-muted-foreground">Nimic nu se salvează până nu apeși „Confirm datele”. Câmpurile marcate trebuie verificate.</p> : null}
              {draft.warnings.includes("expired") ? <Warn>Actul este expirat.</Warn> : null}
              {draft.warnings.includes("mrz_invalid") ? <Warn>Codul din partea de jos a actului nu trece cifrele de control. Verifică numele, numărul și datele.</Warn> : null}
              <div className="space-y-1.5">
                <Label>Tipul actului</Label>
                <Select value={draft.docType} onValueChange={(v) => setDraft({ ...draft, docType: v as ScanDocType })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{SCAN_DOC_TYPES.map((t) => <SelectItem key={t} value={t}>{SCAN_DOC_TYPE_LABELS[t]}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                {ORDER.map((k) => {
                  const flags = draft.flags[k] ?? [];
                  const id = `id-field-${k}`;
                  return (
                    <div key={k} className={k === "address" ? "space-y-1 sm:col-span-2" : "space-y-1"}>
                      <Label htmlFor={id}>{FIELD_LABELS[k]}</Label>
                      <Input id={id} type={DATE_FIELDS.has(k) ? "date" : "text"} value={draft.values[k]}
                        aria-invalid={flags.length > 0} className={flags.length ? "border-destructive" : undefined}
                        placeholder={k === "cnp" && draft.mode === "manual" && row?.cnp && row.cnp !== "—" ? `${row.cnp} (neschimbat)` : undefined}
                        onChange={(e) => setValue(k, e.target.value)} />
                      {flags.map((f) => <p key={f} className="text-xs text-destructive">{SCAN_FLAG_LABELS[f] ?? f}</p>)}
                    </div>
                  );
                })}
              </div>
              {needsAddress ? (
                <Warn>
                  Buletinul cu cip nu are domiciliul tipărit. Scanează certificatul de atestare a domiciliului sau completează domiciliul manual.
                  <input ref={certInput} type="file" accept="image/*,application/pdf" className="sr-only" aria-label="Certificat de domiciliu"
                    onChange={async (e) => {
                      const f = e.target.files?.[0]; e.target.value = "";
                      if (!f) return;
                      if (f.size > MAX_FILE_BYTES) { toast.error("Certificatul poate avea cel mult 10 MB."); return; }
                      setBusy(true);
                      try {
                        const cert = await prepareIdCapture(f);
                        const res = await scan({ data: { contactId, images: [], certificate: cert, docType: draft.docType } });
                        if (res.state !== "read") { toast.error(res.message); return; }
                        const addr = res.result.fields.address;
                        if (!addr.value) { toast.error("Domiciliul nu a putut fi citit. Completează manual."); return; }
                        setDraft((d) => d && ({ ...d, values: { ...d.values, address: addr.value ?? "" }, addressSource: "certificat_domiciliu", flags: { ...d.flags, address: addr.flags.filter((x) => x !== "address_required") } }));
                      } catch (err) {
                        toast.error(err instanceof Error ? err.message : "Certificatul nu a putut fi citit.");
                      } finally { setBusy(false); }
                    }} />
                  <Button size="sm" variant="outline" className="mt-2" disabled={busy} onClick={() => certInput.current?.click()}>Scanează certificatul</Button>
                </Warn>
              ) : null}
              {nameDiffers ? (
                <fieldset className="space-y-1 rounded-lg bg-muted/50 p-3">
                  <legend className="text-xs font-medium">Numele din act diferă de cel din fișă</legend>
                  <label className="flex items-center gap-2"><input type="radio" checked={nameChoice === "keep"} onChange={() => setNameChoice("keep")} /> Păstrează „{lastName} {firstName}”</label>
                  <label className="flex items-center gap-2"><input type="radio" checked={nameChoice === "act"} onChange={() => setNameChoice("act")} /> Folosește „{actName?.last} {actName?.first}”</label>
                </fieldset>
              ) : null}
            </div>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDraft(null)} disabled={busy}>Renunță</Button>
            <Button onClick={confirm} disabled={busy}>Confirm datele</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}

function Item({ label, value, warn }: { label: string; value: string; warn?: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="truncate">{value || "—"}{warn ? <span className="ml-2 text-xs font-medium text-destructive">{warn}</span> : null}</dd>
    </div>
  );
}

function Warn({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex gap-2 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm">
      <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden />
      <div>{children}</div>
    </div>
  );
}
