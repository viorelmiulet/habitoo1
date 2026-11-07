import { useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { createDynamicFeedPortal } from "@/lib/dynamic-feed-portals.functions";
import { chooseFeedPrefix, dynamicFeedPortalSchema } from "@/lib/dynamic-feed-portals";
import { STATIC_PORTALS, PROMOTION_CATALOGS } from "@/lib/portals/registry";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "@/components/ui/sonner";

export function AddFeedPortalDialog({ open, onOpenChange, prefixes, onCreated }: {
  open: boolean; onOpenChange: (value: boolean) => void; prefixes: string[]; onCreated: (key: string) => void;
}) {
  const save = useServerFn(createDynamicFeedPortal);
  const [name, setName] = useState(""); const [slug, setSlug] = useState(""); const [website, setWebsite] = useState("");
  const [xml, setXml] = useState(false); const [visible, setVisible] = useState(false); const [file, setFile] = useState<File | null>(null);
  const [pending, setPending] = useState(false); const [error, setError] = useState<string | null>(null);
  const prefix = useMemo(() => { try { return slug ? chooseFeedPrefix(slug, [...prefixes, "hbps_"]) : ""; } catch { return ""; } }, [slug, prefixes]);
  async function submit(event: React.FormEvent) {
    event.preventDefault(); if (pending) return; setPending(true); setError(null);
    let path: string | null = null;
    try {
      const input = dynamicFeedPortalSchema.parse({ display_name: name, slug, website, xml_enabled: xml, show_public: visible });
      if ([...STATIC_PORTALS, ...PROMOTION_CATALOGS].some(p => p.id === slug)) throw new Error("Identificatorul există deja în registry.");
      if (file) {
        if (!["image/png", "image/jpeg", "image/webp"].includes(file.type) || file.size > 2 * 1024 * 1024) throw new Error("Alege PNG, JPG sau WebP, maximum 2 MB.");
        const image = await createImageBitmap(file); image.close();
        const ext = file.type === "image/jpeg" ? "jpg" : file.type === "image/webp" ? "webp" : "png";
        path = `${slug}/${crypto.randomUUID()}.${ext}`;
        const { error: uploadError } = await supabase.storage.from("feed-portal-logos").upload(path, file, { contentType: file.type, upsert: false });
        if (uploadError) throw new Error("Logo-ul nu a putut fi încărcat.");
      }
      const result = await save({ data: { ...input, logo_path: path } });
      onOpenChange(false); onCreated(result.key);
      setName(""); setSlug(""); setWebsite(""); setFile(null); setXml(false); setVisible(false);
    } catch (failure) {
      if (path) await supabase.storage.from("feed-portal-logos").remove([path]);
      const message = failure instanceof Error ? failure.message : "Portalul nu a putut fi salvat.";
      setError(message); toast.error(message);
    } finally { setPending(false); }
  }
  return <Dialog open={open} onOpenChange={value => { if (!pending) onOpenChange(value); }}><DialogContent className="max-h-[90dvh] overflow-y-auto">
    <DialogHeader><DialogTitle>Adaugă portal cu feed</DialogTitle></DialogHeader>
    <form onSubmit={submit} className="space-y-4">
      <div className="space-y-1.5"><Label htmlFor="feed-name">Numele afișat</Label><Input id="feed-name" value={name} onChange={e => setName(e.target.value)} required maxLength={100} placeholder="ExempluImob.ro" /></div>
      <div className="space-y-1.5"><Label htmlFor="feed-slug">Identificator</Label><Input id="feed-slug" value={slug} onChange={e => setSlug(e.target.value)} required maxLength={40} placeholder="exempluimob" pattern="[a-z][a-z0-9-]{1,39}" /></div>
      <div className="space-y-1.5"><Label htmlFor="feed-prefix">Prefixul cheii</Label><Input id="feed-prefix" readOnly value={prefix} className="font-mono" /></div>
      <div className="space-y-1.5"><Label htmlFor="feed-website">Site-ul portalului</Label><Input id="feed-website" type="url" value={website} onChange={e => setWebsite(e.target.value)} required placeholder="https://exempluimob.ro" /></div>
      <div className="space-y-1.5"><Label htmlFor="feed-logo">Logo</Label><Input id="feed-logo" type="file" accept="image/png,image/jpeg,image/webp" onChange={e => setFile(e.target.files?.[0] ?? null)} /><p className="text-xs text-muted-foreground">PNG, JPG sau WebP · maximum 2 MB</p></div>
      <Label className="flex items-center gap-3"><Checkbox checked={xml} onCheckedChange={v => setXml(v === true)} />Oferă și feed XML Kyero</Label>
      <Label className="flex items-center gap-3"><Checkbox checked={visible} onCheckedChange={v => setVisible(v === true)} />Afișează public</Label>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <div className="flex justify-end gap-2"><Button type="button" variant="outline" disabled={pending} onClick={() => onOpenChange(false)}>Renunță</Button><Button type="submit" disabled={pending}>{pending ? "Se salvează…" : "Salvează portalul"}</Button></div>
    </form>
  </DialogContent></Dialog>;
}