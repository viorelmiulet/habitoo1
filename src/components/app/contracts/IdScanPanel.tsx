/**
 * C6 — panoul unic de scanare a actului, folosit în „Document nou” și pe fișa clientului.
 * Imaginile sunt comprimate în browser și trimise doar scannerului C4; nu se păstrează.
 */
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Camera, Loader2, RotateCcw, ShieldCheck, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { scanContactIdentity } from "@/lib/contracts/identity-scan.functions";
import { prepareIdCapture } from "@/lib/contracts/image";
import { SCAN_DOC_TYPES, SCAN_DOC_TYPE_LABELS, type ScanDocType, type ScanResult } from "@/lib/contracts/id/scan";

const MAX_FILE_BYTES = 10 * 1024 * 1024;

const FRAMING_HINTS: Record<ScanDocType | "auto", string> = {
  auto: "Tot actul în cadru, drept, fără reflexii și cu textul lizibil. Pentru CEI, pașaport și permis, rândurile de jos trebuie să intre complet.",
  ci: "Fotografiază fața buletinului: tot cardul în cadru, cu cele două rânduri de jos complete.",
  cei: "Fotografiază fața și spatele cardului. Pe spate, cele trei rânduri de jos trebuie să intre complet în cadru.",
  pasaport: "Fotografiază pagina cu poza: cele două rânduri de jos trebuie să intre complet, fără reflexii.",
  permis_sedere: "Fotografiază fața și spatele permisului; rândurile de jos trebuie să intre complet.",
  altul: "Tot actul în cadru, drept, cu textul lizibil.",
};

export function IdScanPanel({
  contactId,
  idPrefix,
  onResult,
}: {
  contactId?: string | null;
  /** Prefix unic pentru id-urile câmpurilor (mai multe panouri pe aceeași pagină). */
  idPrefix: string;
  onResult: (result: ScanResult) => void;
}) {
  const scan = useServerFn(scanContactIdentity);
  const [files, setFiles] = useState<File[]>([]);
  const [certificate, setCertificate] = useState<File | null>(null);
  const [docType, setDocType] = useState<ScanDocType | "auto">("auto");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function addFiles(list: FileList | null) {
    const picked = Array.from(list ?? []);
    if (picked.some((f) => f.size > MAX_FILE_BYTES * 3)) {
      setError("Imaginea este prea mare. Folosește o poză de cel mult 10 MB.");
      return;
    }
    setError(null);
    setFiles((prev) => [...prev, ...picked].slice(0, 2));
  }

  async function run() {
    setBusy(true);
    setError(null);
    try {
      // Comprimare în browser: redimensionare și JPEG, ca să rămână sub 10 MB.
      const images = [];
      for (const f of files) images.push(await prepareIdCapture(f));
      if (certificate && certificate.size > MAX_FILE_BYTES) throw new Error("Certificatul poate avea cel mult 10 MB.");
      const cert = certificate ? await prepareIdCapture(certificate) : null;
      const res = await scan({
        data: { contactId: contactId || null, images, certificate: cert, docType: docType === "auto" ? null : docType },
      });
      if (res.state !== "read") {
        setError(res.message);
        return;
      }
      onResult(res.result);
      setFiles([]);
      setCertificate(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Actul nu a putut fi citit.");
    } finally {
      setBusy(false);
    }
  }

  const showCertificate = docType === "auto" || docType === "cei";

  return (
    <div className="min-w-0 space-y-3 rounded-md border border-border bg-muted/30 p-3 text-sm" data-testid="id-scan-panel">
      <div className="grid min-w-0 gap-3 sm:grid-cols-2">
        <div className="min-w-0 space-y-1.5">
          <Label htmlFor={`${idPrefix}-doctype`}>Tipul actului</Label>
          <Select value={docType} onValueChange={(v) => setDocType(v as ScanDocType | "auto")}>
            <SelectTrigger id={`${idPrefix}-doctype`}><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="auto">Detectare automată</SelectItem>
              {SCAN_DOC_TYPES.map((t) => <SelectItem key={t} value={t}>{SCAN_DOC_TYPE_LABELS[t]}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="min-w-0 space-y-1.5">
          <Label htmlFor={`${idPrefix}-files`}>Fotografii act ({files.length}/2: față, verso)</Label>
          <Input id={`${idPrefix}-files`} type="file" accept="image/*" capture="environment"
            disabled={files.length >= 2 || busy} className="min-w-0"
            onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }} />
        </div>
      </div>
      {files.length ? (
        <ul className="space-y-1 text-xs text-muted-foreground">
          {files.map((f, i) => (
            <li key={i} className="flex min-w-0 items-center gap-2">
              <span className="truncate">{i === 0 ? "Față" : "Verso"}: {f.name}</span>
              <button type="button" className="shrink-0 rounded p-1 hover:bg-muted" aria-label={`Elimină ${i === 0 ? "fața" : "versoul"}`}
                onClick={() => setFiles((prev) => prev.filter((_, j) => j !== i))}>
                <X className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {showCertificate ? (
        <div className="min-w-0 space-y-1.5">
          <Label htmlFor={`${idPrefix}-cert`}>Certificat de atestare a domiciliului (pentru CEI, opțional)</Label>
          <Input id={`${idPrefix}-cert`} type="file" accept="image/*,application/pdf" disabled={busy} className="min-w-0"
            onChange={(e) => {
              const f = e.target.files?.[0] ?? null;
              if (f && f.size > MAX_FILE_BYTES) { setError("Certificatul poate avea cel mult 10 MB."); e.target.value = ""; return; }
              setCertificate(f);
            }} />
        </div>
      ) : null}
      <p className="text-xs text-muted-foreground">{FRAMING_HINTS[docType]}</p>
      <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
        <ShieldCheck className="mt-0.5 size-3.5 shrink-0" aria-hidden />
        Fotografiile nu se salvează nicăieri. Verifică datele completate.
      </p>
      {error ? (
        <div className="space-y-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-xs" role="alert">
          <p>{error}</p>
          <Button type="button" size="sm" variant="outline" onClick={() => void run()} disabled={busy || (!files.length && !certificate)}>
            <RotateCcw className="size-3.5" /> Încearcă din nou
          </Button>
        </div>
      ) : null}
      <Button type="button" size="sm" onClick={() => void run()} disabled={busy || (!files.length && !certificate)} className="w-full sm:w-auto">
        {busy ? <Loader2 className="size-4 animate-spin" /> : <Camera className="size-4" />} {busy ? "Se citește…" : "Scanează actul"}
      </Button>
    </div>
  );
}
