import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Image as ImageIcon, Trash2 } from "lucide-react";
import { toastError } from "@/lib/errors";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { currentUserQueryKey, useCurrentUser } from "@/hooks/use-session";
import {
  AGENCY_LOGO_BUCKET,
  AGENCY_LOGO_MAX_BYTES,
  AGENCY_LOGO_TYPES,
  MEDIA_BUCKET,
  agencyLogoPath,
  removeFromBucket,
  signedUrl,
  uploadToBucket,
} from "@/lib/storage";

import samplePhoto from "@/assets/mock/living.jpg";
import {
  WATERMARK_POSITIONS,
  isWatermarkableLogo,
  watermarkFromOrg,
  watermarkPositionLabels,
  type WatermarkPosition,
} from "@/lib/watermark";
import {
  HABITOO_GOLD,
  brandingFromOrg,
  buildPresentationHtml,
  safeAccent,
  samplePresentation,
} from "@/lib/materials";

/** URL semnat pentru logo-ul agenției (bucket privat). */
export function useAgencyLogoUrl(path?: string | null, seconds = 7 * 24 * 3600) {
  const { data } = useQuery({
    queryKey: ["agency-logo-url", path],
    queryFn: () => signedUrl(AGENCY_LOGO_BUCKET, path as string, seconds),
    enabled: Boolean(path),
    staleTime: 60 * 60_000,
  });
  return data ?? null;
}

/**
 * Identitatea vizuală folosită pe materialele trimise clienților.
 * Doar administratorul agenției poate salva (RLS blochează restul server-side).
 */
export function AgencyBrandingCard() {
  const { data: user } = useCurrentUser();
  const queryClient = useQueryClient();
  const org = user?.organization ?? null;
  const canEdit = Boolean(user?.isAdmin);

  const [form, setForm] = useState({
    accent: safeAccent(org?.material_accent_color),
    phone: org?.material_phone ?? org?.phone ?? "",
    email: org?.material_email ?? org?.email ?? "",
    website: org?.material_website ?? "",
    address: org?.material_address ?? "",
    showHabitoo: org?.material_show_habitoo !== false,
  });

  const logoUrl = useAgencyLogoUrl(org?.logo_path);
  const saved = watermarkFromOrg(org);
  const [wm, setWm] = useState({
    enabled: saved.enabled,
    position: saved.position as WatermarkPosition,
    scalePercent: saved.scalePercent,
    opacityPercent: saved.opacityPercent,
    marginPercent: saved.marginPercent,
  });
  const logoRasterizable = isWatermarkableLogo(org?.logo_path);

  /** Previzualizare pe o fotografie reală din portofoliu, cu una de probă ca rezervă. */
  const { data: previewPhoto } = useQuery({
    queryKey: ["watermark-preview-photo", org?.id],
    enabled: Boolean(org?.id),
    staleTime: 30 * 60_000,
    queryFn: async () => {
      const { data } = await supabase
        .from("property_images")
        .select("storage_path")
        .not("storage_path", "is", null)
        .eq("is_confidential", false)
        .order("created_at", { ascending: false })
        .limit(1);
      const path = data?.[0]?.storage_path;
      if (!path) return null;
      return await signedUrl(MEDIA_BUCKET, path, 3600);
    },
  });
  const photoUrl = previewPhoto ?? samplePhoto;

  const invalidate = () => queryClient.invalidateQueries({ queryKey: currentUserQueryKey });

  const uploadLogo = useMutation({
    mutationFn: async (file: File) => {
      if (!org?.id) throw new Error("Agenția nu este configurată.");
      if (!AGENCY_LOGO_TYPES.includes(file.type)) {
        throw new Error("Folosește un fișier JPG, PNG, SVG sau WebP.");
      }
      if (file.size > AGENCY_LOGO_MAX_BYTES) throw new Error("Fișierul depășește 2 MB.");
      const path = agencyLogoPath(org.id, file.type);
      await uploadToBucket(AGENCY_LOGO_BUCKET, path, file, file.type);
      const previous = org.logo_path ?? null;
      const { error } = await supabase
        .from("organizations")
        .update({ logo_path: path })
        .eq("id", org.id);
      if (error) throw error;
      if (previous && previous !== path) await removeFromBucket(AGENCY_LOGO_BUCKET, [previous]);
    },
    onSuccess: () => {
      invalidate();
      toast.success("Logo-ul agenției a fost actualizat.");
    },
    onError: (e: Error) => toastError(e),
  });

  const removeLogo = useMutation({
    mutationFn: async () => {
      if (!org?.id || !org.logo_path) return;
      const { error } = await supabase
        .from("organizations")
        .update({ logo_path: null })
        .eq("id", org.id);
      if (error) throw error;
      await removeFromBucket(AGENCY_LOGO_BUCKET, [org.logo_path]);
    },
    onSuccess: () => {
      invalidate();
      toast.success("Logo-ul a fost șters.");
    },
    onError: (e: Error) => toastError(e),
  });

  const save = useMutation({
    mutationFn: async () => {
      if (!org?.id) throw new Error("Agenția nu este configurată.");
      const { error } = await supabase
        .from("organizations")
        .update({
          material_accent_color: safeAccent(form.accent),
          material_phone: form.phone.trim() || null,
          material_email: form.email.trim() || null,
          material_website: form.website.trim() || null,
          material_address: form.address.trim() || null,
          material_show_habitoo: form.showHabitoo,
        })
        .eq("id", org.id);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      toast.success("Setările materialelor au fost salvate.");
    },
    onError: (e: Error) => toastError(e),
  });

  const saveWatermark = useMutation({
    mutationFn: async () => {
      if (!org?.id) throw new Error("Agenția nu este configurată.");
      const { error } = await supabase
        .from("organizations")
        .update({
          watermark_enabled: wm.enabled,
          watermark_position: wm.position,
          watermark_scale_percent: wm.scalePercent,
          watermark_opacity_percent: wm.opacityPercent,
          watermark_margin_percent: wm.marginPercent,
        })
        .eq("id", org.id);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      toast.success("Setările watermark-ului au fost salvate.");
    },
    onError: (e: Error) => toastError(e),
  });

  /** Previzualizare live, cu valorile din formular (nu cele salvate). */
  const previewHtml = useMemo(
    () =>
      buildPresentationHtml(
        {
          ...brandingFromOrg(org, logoUrl),
          accent: safeAccent(form.accent),
          phone: form.phone.trim() || null,
          email: form.email.trim() || null,
          website: form.website.trim() || null,
          address: form.address.trim() || null,
          showHabitoo: form.showHabitoo,
        },
        samplePresentation,
      ),
    [org, logoUrl, form],
  );

  return (
    <section className="panel space-y-5 p-5">
      <div className="space-y-1">
        <h2 className="text-base font-medium tracking-tight">Identitatea vizuală a materialelor</h2>
        <p className="text-sm text-muted-foreground">
          Logo-ul, accentul și datele de contact apar pe prezentările printabile și pe ofertele
          trimise clienților. Interfața aplicației și feedurile către portaluri rămân neschimbate.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <div className="flex size-20 items-center justify-center overflow-hidden rounded-2xl bg-secondary/60">
          {logoUrl ? (
            <img
              src={logoUrl}
              alt={org?.name ?? "Logo agenție"}
              className="size-full object-contain p-2"
            />
          ) : (
            <ImageIcon className="size-6 text-muted-foreground" aria-hidden />
          )}
        </div>
        <div className="min-w-56 flex-1 space-y-2">
          <Label htmlFor="agency-logo">Logo agenție</Label>
          <Input
            id="agency-logo"
            type="file"
            accept="image/jpeg,image/png,image/svg+xml,image/webp"
            disabled={!canEdit || uploadLogo.isPending}
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (file) uploadLogo.mutate(file);
            }}
          />
          <p className="text-xs text-muted-foreground">JPG, PNG, SVG sau WebP, maximum 2 MB.</p>
        </div>
        {canEdit && org?.logo_path ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={removeLogo.isPending}
            onClick={() => removeLogo.mutate()}
          >
            <Trash2 className="size-4" /> Șterge logo
          </Button>
        ) : null}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="accent">Culoarea de accent</Label>
          <div className="flex items-center gap-2">
            <input
              id="accent"
              type="color"
              value={safeAccent(form.accent)}
              disabled={!canEdit}
              onChange={(e) => setForm((f) => ({ ...f, accent: e.target.value }))}
              className="h-10 w-14 cursor-pointer rounded-lg border border-border bg-background p-1"
            />
            <Input
              value={form.accent}
              disabled={!canEdit}
              onChange={(e) => setForm((f) => ({ ...f, accent: e.target.value }))}
            />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={!canEdit}
              onClick={() => setForm((f) => ({ ...f, accent: HABITOO_GOLD }))}
            >
              Implicit
            </Button>
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="mat_phone">Telefon afișat</Label>
          <Input
            id="mat_phone"
            value={form.phone}
            disabled={!canEdit}
            onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="mat_email">Email afișat</Label>
          <Input
            id="mat_email"
            value={form.email}
            disabled={!canEdit}
            onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="mat_site">Site</Label>
          <Input
            id="mat_site"
            value={form.website}
            disabled={!canEdit}
            placeholder="www.agentia.ro"
            onChange={(e) => setForm((f) => ({ ...f, website: e.target.value }))}
          />
        </div>
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="mat_address">Adresă</Label>
          <Input
            id="mat_address"
            value={form.address}
            disabled={!canEdit}
            onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
          />
        </div>
      </div>

      <div className="flex items-start justify-between gap-4 rounded-xl border border-border p-4">
        <div className="space-y-1">
          <Label htmlFor="show_habitoo" className="text-sm">
            Afișează și marca Habitoo
          </Label>
          <p className="text-xs text-muted-foreground">
            Discret, în subsolul materialelor. Dezactivează pentru materiale complet proprii.
          </p>
        </div>
        <Switch
          id="show_habitoo"
          checked={form.showHabitoo}
          disabled={!canEdit}
          onCheckedChange={(v) => setForm((f) => ({ ...f, showHabitoo: v }))}
        />
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium">Previzualizare prezentare de probă</p>
        <iframe
          title="Previzualizare material"
          srcDoc={previewHtml}
          className="h-96 w-full rounded-xl border border-border bg-white"
        />
      </div>

      {canEdit ? (
        <div className="flex justify-end">
          <Button type="button" disabled={save.isPending} onClick={() => save.mutate()}>
            Salvează materialele
          </Button>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">
          Doar administratorul agenției poate modifica identitatea materialelor.
        </p>
      )}
      <div className="space-y-5 border-t border-border pt-5">
        <div className="space-y-1">
          <h3 className="text-base font-medium tracking-tight">
            Watermark pe fotografiile trimise portalurilor
          </h3>
          <p className="text-sm text-muted-foreground">
            Se aplică doar pe copiile servite portalurilor. Fotografiile din CRM rămân curate și pot
            fi descărcate oricând fără watermark.
          </p>
        </div>

        <div className="flex items-start justify-between gap-4 rounded-xl border border-border p-4">
          <div className="space-y-1">
            <Label htmlFor="wm_enabled" className="text-sm">
              Activează watermark-ul
            </Label>
            <p className="text-xs text-muted-foreground">
              {logoRasterizable
                ? "Implicit dezactivat. Nimic nu se schimbă până nu îl activezi."
                : "Pentru watermark este nevoie de un logo PNG sau JPG. Fișierele SVG și WebP nu pot fi folosite."}
            </p>
          </div>
          <Switch
            id="wm_enabled"
            checked={wm.enabled}
            disabled={!canEdit || !logoRasterizable}
            onCheckedChange={(v) => setWm((f) => ({ ...f, enabled: v }))}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="wm_position">Poziție</Label>
            <Select
              value={wm.position}
              disabled={!canEdit}
              onValueChange={(v) => setWm((f) => ({ ...f, position: v as WatermarkPosition }))}
            >
              <SelectTrigger id="wm_position">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {WATERMARK_POSITIONS.map((p) => (
                  <SelectItem key={p} value={p}>
                    {watermarkPositionLabels[p]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Dimensiune: {wm.scalePercent}% din lățimea fotografiei</Label>
            <Slider
              min={10}
              max={35}
              step={1}
              value={[wm.scalePercent]}
              disabled={!canEdit}
              onValueChange={([v]) => setWm((f) => ({ ...f, scalePercent: v ?? f.scalePercent }))}
            />
          </div>
          <div className="space-y-2">
            <Label>Opacitate: {wm.opacityPercent}%</Label>
            <Slider
              min={20}
              max={100}
              step={5}
              value={[wm.opacityPercent]}
              disabled={!canEdit}
              onValueChange={([v]) =>
                setWm((f) => ({ ...f, opacityPercent: v ?? f.opacityPercent }))
              }
            />
          </div>
          <div className="space-y-2">
            <Label>Margine: {wm.marginPercent}%</Label>
            <Slider
              min={0}
              max={20}
              step={1}
              value={[wm.marginPercent]}
              disabled={!canEdit}
              onValueChange={([v]) => setWm((f) => ({ ...f, marginPercent: v ?? f.marginPercent }))}
            />
          </div>
        </div>

        <div className="space-y-2">
          <p className="text-sm font-medium">Previzualizare pe fotografie</p>
          <div className="relative overflow-hidden rounded-xl border border-border bg-secondary/40">
            <img src={photoUrl} alt="Previzualizare watermark" className="block w-full" />
            {logoUrl && logoRasterizable ? (
              <img
                src={logoUrl}
                alt=""
                aria-hidden
                className="absolute object-contain"
                style={{
                  width: `${wm.scalePercent}%`,
                  opacity: wm.opacityPercent / 100,
                  ...(wm.position === "center"
                    ? { left: "50%", top: "50%", transform: "translate(-50%, -50%)" }
                    : {
                        [wm.position.includes("left") ? "left" : "right"]: `${wm.marginPercent}%`,
                        [wm.position.includes("top") ? "top" : "bottom"]: `${wm.marginPercent}%`,
                      }),
                }}
              />
            ) : null}
          </div>
          <p className="text-xs text-muted-foreground">
            {previewPhoto ? "Fotografie din portofoliul agenției." : "Fotografie de probă."}
          </p>
        </div>

        {canEdit ? (
          <div className="flex justify-end">
            <Button
              type="button"
              disabled={saveWatermark.isPending}
              onClick={() => saveWatermark.mutate()}
            >
              Salvează watermark-ul
            </Button>
          </div>
        ) : null}
      </div>
    </section>
  );
}
