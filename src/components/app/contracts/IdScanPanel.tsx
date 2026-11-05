/**
 * C6 — panoul unic de scanare a actului, folosit în „Document nou” și pe fișa clientului.
 * Imaginile sunt comprimate în browser și trimise doar scannerului C4; nu se păstrează.
 */
import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Camera, ImagePlus, Loader2, RotateCcw, ShieldCheck, X } from "lucide-react";
import { Button } from "@/components/ui/button";
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
  // „Fotografiază” apare doar pe dispozitive tactile; detectat după montare, ca SSR-ul să rămână stabil.
  const [isTouch, setIsTouch] = useState(false);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const uploadInputRef = useRef<HTMLInputElement>(null);
  const certPhotoInputRef = useRef<HTMLInputElement>(null);
  const certUploadInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const mq = window.matchMedia("(pointer: coarse)");
    const update = () => setIsTouch(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  // Miniaturile trăiesc doar în browser; URL-urile se eliberează la eliminare și la demontare.
  const [previews, setPreviews] = useState<string[]>([]);
  useEffect(() => {
    const urls = files.map((f) => URL.createObjectURL(f));
    setPreviews(urls);
    return () => urls.forEach((u) => URL.revokeObjectURL(u));
  }, [files]);

  function addFiles(list: FileList | null) {
    const picked = Array.from(list ?? []);
    if (picked.some((f) => f.size > MAX_FILE_BYTES * 3)) {
      setError("Imaginea este prea mare. Folosește o poză de cel mult 10 MB.");
      return;
    }
    setError(null);
    setFiles((prev) => [...prev, ...picked].slice(0, 2));
  }

  function pickCertificate(list: FileList | null) {
    const f = list?.[0] ?? null;
    if (f && f.size > MAX_FILE_BYTES) {
      setError("Certificatul poate avea cel mult 10 MB.");
      return;
    }
    setCertificate(f);
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
  const photosFull = files.length >= 2;

  return (
    <div className="min-w-0 space-y-3 rounded-md border border-border bg-muted/30 p-3 text-sm" data-testid="id-scan-panel">
      <div className="min-w-0 space-y-1">
        <p className="flex items-center gap-2 text-base font-bold text-foreground">
          <Camera className="size-4 shrink-0" aria-hidden /> Scanează actul de identitate
        </p>
        <p className="text-[13px] text-muted-foreground">Fotografiază actul sau încarcă o poză; datele se completează automat.</p>
      </div>
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
      <div className="min-w-0 space-y-2">
        <p className="text-sm font-medium">Fotografii act ({files.length}/2: față, verso)</p>
        <div className="flex min-w-0 flex-col gap-2 sm:flex-row">
          {isTouch ? (
            <Button type="button" variant="outline" className="min-h-11 w-full sm:w-auto"
              disabled={photosFull || busy} onClick={() => photoInputRef.current?.click()}>
              <Camera className="size-4" /> Fotografiază actul
            </Button>
          ) : null}
          <Button type="button" variant="outline" className="min-h-11 w-full sm:w-auto"
            disabled={photosFull || busy} onClick={() => uploadInputRef.current?.click()}>
            <ImagePlus className="size-4" /> Încarcă o poză
          </Button>
        </div>
        <input ref={photoInputRef} id={`${idPrefix}-photo`} type="file" accept="image/*" capture="environment" multiple
          disabled={photosFull || busy} className="hidden" aria-label="Fotografiază actul"
          onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }} />
        <input ref={uploadInputRef} id={`${idPrefix}-upload`} type="file" accept="image/*" multiple
          disabled={photosFull || busy} className="hidden" aria-label="Încarcă o poză"
          onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }} />
      </div>
      {files.length ? (
        <ul className="flex flex-wrap gap-2">
          {files.map((f, i) => (
            <li key={i} className="flex min-w-0 items-center gap-2 rounded-[10px] border border-border bg-card p-1.5">
              {previews[i] ? (
                <img src={previews[i]} alt="" className="size-11 shrink-0 rounded-lg object-cover" />
              ) : null}
              <span className="min-w-0 text-xs font-semibold">{i === 0 ? "Față" : "Verso"}</span>
              <button type="button" className="flex size-11 shrink-0 items-center justify-center rounded-lg hover:bg-muted sm:size-8"
                aria-label={`Elimină ${i === 0 ? "fața" : "versoul"}`}
                onClick={() => setFiles((prev) => prev.filter((_, j) => j !== i))}>
                <X className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {showCertificate ? (
        <div className="min-w-0 space-y-2">
          <p className="text-sm font-medium">Certificat de atestare a domiciliului (pentru CEI, opțional)</p>
          <div className="flex min-w-0 flex-col gap-2 sm:flex-row">
            {isTouch ? (
              <Button type="button" variant="outline" className="min-h-11 w-full sm:w-auto"
                disabled={busy} onClick={() => certPhotoInputRef.current?.click()}>
                <Camera className="size-4" /> Fotografiază certificatul
              </Button>
            ) : null}
            <Button type="button" variant="outline" className="min-h-11 w-full sm:w-auto"
              disabled={busy} onClick={() => certUploadInputRef.current?.click()}>
              <ImagePlus className="size-4" /> Încarcă certificatul
            </Button>
          </div>
          <input ref={certPhotoInputRef} id={`${idPrefix}-cert-photo`} type="file" accept="image/*" capture="environment"
            disabled={busy} className="hidden" aria-label="Fotografiază certificatul"
            onChange={(e) => { pickCertificate(e.target.files); e.target.value = ""; }} />
          <input ref={certUploadInputRef} id={`${idPrefix}-cert-upload`} type="file" accept="image/*,application/pdf"
            disabled={busy} className="hidden" aria-label="Încarcă certificatul"
            onChange={(e) => { pickCertificate(e.target.files); e.target.value = ""; }} />
          {certificate ? (
            <p className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
              <span className="truncate">{certificate.name}</span>
              <button type="button" className="flex size-11 shrink-0 items-center justify-center rounded-lg hover:bg-muted sm:size-8"
                aria-label="Elimină certificatul" onClick={() => setCertificate(null)}>
                <X className="size-3.5" />
              </button>
            </p>
          ) : null}
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
