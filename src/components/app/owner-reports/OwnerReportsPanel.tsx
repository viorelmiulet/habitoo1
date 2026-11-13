import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Check, Download, Mail, MessageCircle, SkipForward } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { StatusBadge } from "@/components/app/StatusBadge";
import {
  getOwnerReportLinks, getOwnerReportPanel, markOwnerReportSentWhatsapp, saveOwnerReportSettings,
  sendOwnerReportNow, skipOwnerReport, type OwnerReportRow,
} from "@/lib/owner-reports/owner-reports.functions";
import { formatDateRo } from "@/lib/owner-reports/report";
import { whatsappUrl } from "@/lib/active-matching/plan";
import { useAiFeatures } from "@/hooks/use-ai-features";

const STATUS: Record<OwnerReportRow["status"], { label: string; tone: "info" | "success" | "neutral" | "warning" }> = {
  draft: { label: "Ciornă", tone: "info" }, sent: { label: "Trimis", tone: "success" }, skipped: { label: "Omis", tone: "neutral" }, failed: { label: "Eșuat", tone: "warning" },
};

function usePanel(propertyId: string) {
  const get = useServerFn(getOwnerReportPanel);
  return useQuery({ queryKey: ["owner-report-panel", propertyId], queryFn: () => get({ data: { propertyId } }) });
}

export function OwnerReportSettingsCard({ propertyId }: { propertyId: string }) {
  const { isEnabled } = useAiFeatures();
  const qc = useQueryClient();
  const { data } = usePanel(propertyId);
  const save = useServerFn(saveOwnerReportSettings);
  const m = useMutation({
    mutationFn: (v: { enabled: boolean; autoSend: boolean }) => save({ data: { propertyId, ...v } }),
    onSuccess: (r) => { if (!r.ok) toast.error(r.message ?? "Eroare"); qc.invalidateQueries({ queryKey: ["owner-report-panel", propertyId] }); },
  });
  if (!data?.allowed || !isEnabled("ai_owner_report")) return null;
  return (
    <section className="rounded-[14px] border border-border bg-card p-4 sm:p-5" data-testid="owner-report-settings">
      <div className="flex items-start justify-between gap-3">
        <div>
          <Label htmlFor="or-enabled" className="font-bold">Raport săptămânal pentru proprietar</Label>
          <p className="mt-1 text-[13px] text-muted-foreground">
            {data.hasOwner ? "În fiecare luni pregătim un raport cu săptămâna trecută. Tu decizi dacă îl trimiți." : "Adaugă proprietarul proprietății ca să poți activa raportul."}
          </p>
        </div>
        <Switch id="or-enabled" checked={data.enabled} disabled={!data.hasOwner || m.isPending} onCheckedChange={(v) => m.mutate({ enabled: v, autoSend: v && data.autoSend })} />
      </div>
      {data.enabled ? (
        <div className="mt-4 flex items-start justify-between gap-3 border-t border-border pt-4">
          <div>
            <Label htmlFor="or-auto" className="font-semibold">Trimite automat</Label>
            <p className="mt-1 text-[13px] text-muted-foreground">
              {data.canAutoSend ? "Emailul pleacă luni la 09:00 dacă nu îl oprești până atunci." : "Disponibil doar dacă proprietarul are email și consimțământ GDPR înregistrat."}
            </p>
          </div>
          <Switch id="or-auto" checked={data.autoSend} disabled={!data.canAutoSend || m.isPending} onCheckedChange={(v) => m.mutate({ enabled: true, autoSend: v })} />
        </div>
      ) : null}
    </section>
  );
}

function ReportItem({ r, propertyId }: { r: OwnerReportRow; propertyId: string }) {
  const qc = useQueryClient();
  const refresh = () => qc.invalidateQueries({ queryKey: ["owner-report-panel", propertyId] });
  const [showPreview, setShowPreview] = useState(r.status === "draft");
  const send = useServerFn(sendOwnerReportNow);
  const skip = useServerFn(skipOwnerReport);
  const links = useServerFn(getOwnerReportLinks);
  const waDone = useServerFn(markOwnerReportSentWhatsapp);
  const [waPending, setWaPending] = useState(false);
  const act = useMutation({
    mutationFn: async (kind: "email" | "skip" | "wa-done") => kind === "email" ? send({ data: { reportId: r.id } }) : kind === "skip" ? skip({ data: { reportId: r.id } }) : waDone({ data: { reportId: r.id } }),
    onSuccess: (res, kind) => { if (res.ok) { toast.success(kind === "skip" ? "Raportul nu se trimite săptămâna aceasta." : "Trimiterea a fost înregistrată în istoricul proprietarului."); setWaPending(false); } else toast.error(res.message ?? "Eroare"); refresh(); },
  });
  const open = async (kind: "pdf" | "wa") => {
    const win = window.open("", "_blank");
    const res = await links({ data: { reportId: r.id } });
    if (!res.ok || !res.pdfUrl) { win?.close(); toast.error(res.message ?? "Eroare"); return; }
    const url = kind === "pdf" ? res.pdfUrl : whatsappUrl(res.phone, res.text ?? "") ?? `https://wa.me/?text=${encodeURIComponent(res.text ?? "")}`;
    if (win) win.location.href = url; else window.location.href = url;
    if (kind === "wa") setWaPending(true);
  };
  const st = STATUS[r.status];
  return (
    <li className="border-b border-border px-4 py-3 last:border-0 sm:px-5" data-testid="owner-report-row">
      <div className="flex flex-wrap items-center gap-2">
        <p className="font-semibold">Săptămâna {formatDateRo(r.week_start)} – {formatDateRo(r.week_end)}</p>
        <StatusBadge tone={st.tone}>{st.label}</StatusBadge>
        {r.status === "draft" && r.auto_send ? <StatusBadge tone="info">Se trimite automat la 09:00</StatusBadge> : null}
        {!r.is_ai && r.has_pdf ? <span className="text-xs text-muted-foreground">text standard (fără AI)</span> : null}
        {r.sent_at ? <span className="text-xs text-muted-foreground">trimis {new Date(r.sent_at).toLocaleString("ro-RO")}{r.sent_via === "auto" ? " automat" : r.sent_via === "whatsapp" ? " pe WhatsApp" : " pe email"}</span> : null}
      </div>
      {r.send_error && r.status === "draft" ? <p className="mt-1 text-xs text-destructive">{r.send_error}</p> : null}
      {r.short_text ? <button type="button" className="mt-1 text-xs text-muted-foreground underline" onClick={() => setShowPreview((v) => !v)}>{showPreview ? "Ascunde previzualizarea" : "Previzualizare"}</button> : null}
      {showPreview && r.short_text ? <pre className="mt-2 whitespace-pre-wrap rounded-lg bg-muted p-3 font-sans text-[13px]">{r.short_text}</pre> : null}
      <div className="mt-2 flex flex-wrap gap-2">
        {r.has_pdf ? <Button size="sm" variant="outline" onClick={() => open("pdf")}><Download className="mr-1 h-4 w-4" />Descarcă PDF</Button> : null}
        {r.status === "draft" && r.has_pdf ? (
          <>
            <Button size="sm" disabled={act.isPending} onClick={() => act.mutate("email")}><Mail className="mr-1 h-4 w-4" />Trimite pe email</Button>
            <Button size="sm" variant="outline" onClick={() => open("wa")}><MessageCircle className="mr-1 h-4 w-4" />WhatsApp</Button>
            {waPending ? <Button size="sm" variant="outline" disabled={act.isPending} onClick={() => act.mutate("wa-done")}><Check className="mr-1 h-4 w-4" />Am trimis pe WhatsApp</Button> : null}
            <Button size="sm" variant="ghost" disabled={act.isPending} onClick={() => act.mutate("skip")}><SkipForward className="mr-1 h-4 w-4" />Nu trimite săptămâna asta</Button>
          </>
        ) : null}
      </div>
    </li>
  );
}

export function OwnerReportsHistory({ propertyId }: { propertyId: string }) {
  const { data, isLoading } = usePanel(propertyId);
  if (isLoading) return <p className="text-sm text-muted-foreground">Se încarcă…</p>;
  if (!data?.allowed) return <p className="text-sm text-muted-foreground">Rapoartele sunt vizibile agentului proprietății și administratorului agenției.</p>;
  return (
    <div className="space-y-4">
      <OwnerReportSettingsCard propertyId={propertyId} />
      <div className="overflow-hidden rounded-[14px] border border-border bg-card">
        {data.reports.length ? <ul>{data.reports.map((r) => <ReportItem key={r.id} r={r} propertyId={propertyId} />)}</ul> : <p className="p-4 text-sm text-muted-foreground">Niciun raport încă. Primul se pregătește luni dimineață, după activare.</p>}
      </div>
    </div>
  );
}
