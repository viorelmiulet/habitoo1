import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Download, Image as ImageIcon, Loader2, Save, X } from "lucide-react";
import { toast } from "@/components/ui/sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { AVATAR_BUCKET, MEDIA_BUCKET, signedUrl, signedUrls } from "@/lib/storage";
import {
  cleanPosterTitle,
  contrastRatio,
  DEFAULT_POSTER_COLORS,
  downloadPoster,
  formatPosterPrice,
  formatViewing,
  normalizeHex,
  POSTER_STAMPS,
  posterFileName,
  renderSocialPoster,
  SOCIAL_POSTER_FORMATS,
  SOCIAL_POSTER_SIZES,
  type PosterLogoBackground,
  type PosterStamp,
  type SocialPosterFormat,
  type SocialPosterTransaction,
} from "@/lib/social-poster";
import { cn } from "@/lib/utils";

type SocialPosterDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  propertyId: string;
  userId: string;
  title: string;
  location: string;
  rooms: number | null;
  surface: number | null;
  floor: string | null;
  forSale: boolean;
  forRent: boolean;
  salePrice: number | null;
  rentPrice: number | null;
  saleCurrency: string;
  rentCurrency: string;
  logoUrl: string | null;
  phone: string | null;
  agentName: string | null;
  agentAvatarPath: string | null;
};

type StyleSettings = {
  format: SocialPosterFormat;
  labelOn: boolean;
  overtitleOn: boolean;
  locationOn: boolean;
  priceOn: boolean;
  titleScale: number;
  detailsOn: boolean;
  agentOn: boolean;
  bigPhotoOn: boolean;
  stampOn: boolean;
  stamp: PosterStamp;
  logoOn: boolean;
  accent: string;
  background: string;
  text: string;
  logoBackground: PosterLogoBackground;
};

type PosterSettings = StyleSettings & {
  transaction: SocialPosterTransaction;
  photoIndex: number;
  labelText: string;
  overtitleText: string;
  title: string;
  locationText: string;
  priceText: string;
  oldPriceOn: boolean;
  oldPriceText: string;
  viewingDateOn: boolean;
  viewingDate: string;
  viewingTimeOn: boolean;
  viewingTime: string;
};

const STYLE_KEYS: (keyof StyleSettings)[] = [
  "format", "labelOn", "overtitleOn", "locationOn", "priceOn", "titleScale", "detailsOn", "agentOn",
  "bigPhotoOn", "stampOn", "stamp", "logoOn", "accent", "background", "text", "logoBackground",
];

const DEFAULT_STYLE: StyleSettings = {
  format: "square",
  labelOn: true,
  overtitleOn: true,
  locationOn: true,
  priceOn: true,
  titleScale: 100,
  detailsOn: true,
  agentOn: false,
  bigPhotoOn: false,
  stampOn: false,
  stamp: "new",
  logoOn: true,
  accent: DEFAULT_POSTER_COLORS.accent,
  background: DEFAULT_POSTER_COLORS.background,
  text: DEFAULT_POSTER_COLORS.text,
  logoBackground: "white",
};

const ACCENT_PRESETS = ["#C8A24B", "#E0B860", "#B7791F", "#D97757", "#2F855A", "#3182CE", "#C53030", "#FFFFFF"];
const BACKGROUND_PRESETS = ["#0E1118", "#1A202C", "#22303C", "#1F2A24", "#2D1B12", "#3B0D11", "#F7F3EA", "#FFFFFF"];
const TEXT_PRESETS = ["#FFFFFF", "#F7F3EA", "#E2E8F0", "#C8A24B", "#0E1118", "#1A202C", "#4A5568", "#000000"];

function readJson<T>(key: string): Partial<T> | null {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as Partial<T>) : null;
  } catch {
    return null;
  }
}

export function SocialPosterDialog(props: SocialPosterDialogProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [photos, setPhotos] = useState<string[]>([]);
  const [loadingPhotos, setLoadingPhotos] = useState(false);
  const [rendering, setRendering] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [photoPickerOpen, setPhotoPickerOpen] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const styleKey = `habitoo:social-poster:${props.userId}`;
  const propertyKey = `habitoo:social-poster:${props.userId}:${props.propertyId}`;

  const defaultTransaction: SocialPosterTransaction = props.forRent && !props.forSale ? "rent" : "sale";
  const priceFor = (t: SocialPosterTransaction) =>
    t === "sale" ? formatPosterPrice(props.salePrice, props.saleCurrency) : formatPosterPrice(props.rentPrice, props.rentCurrency);
  const labelFor = (t: SocialPosterTransaction) => (t === "rent" ? "De închiriat" : "De vânzare");

  const buildDefaults = (): PosterSettings => ({
    ...DEFAULT_STYLE,
    transaction: defaultTransaction,
    photoIndex: 0,
    labelText: labelFor(defaultTransaction),
    overtitleText: "Ofertă exclusivă",
    title: cleanPosterTitle(props.title),
    locationText: props.location,
    priceText: priceFor(defaultTransaction),
    oldPriceOn: false,
    oldPriceText: "",
    viewingDateOn: false,
    viewingDate: "",
    viewingTimeOn: false,
    viewingTime: "14:00",
  });
  const [s, setS] = useState<PosterSettings>(buildDefaults);
  const update = (patch: Partial<PosterSettings>) => setS((prev) => ({ ...prev, ...patch }));

  useEffect(() => {
    if (!props.open) return;
    const style = readJson<StyleSettings>(styleKey) ?? {};
    const saved = readJson<PosterSettings>(propertyKey) ?? {};
    setS({ ...buildDefaults(), ...style, ...saved });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.open, styleKey, propertyKey]);

  useEffect(() => {
    if (!props.open || !props.agentAvatarPath) { setAvatarUrl(null); return; }
    let active = true;
    void signedUrl(AVATAR_BUCKET, props.agentAvatarPath, 3600).then((url) => { if (active) setAvatarUrl(url ?? null); }).catch(() => { if (active) setAvatarUrl(null); });
    return () => { active = false; };
  }, [props.open, props.agentAvatarPath]);

  useEffect(() => {
    if (!props.open) return;
    let active = true;
    setLoadingPhotos(true);
    setError(null);
    void (async () => {
      const { data, error: queryError } = await supabase
        .from("property_images")
        .select("url,storage_path,position,is_primary,is_confidential")
        .eq("property_id", props.propertyId)
        .eq("is_confidential", false)
        .order("position");
      if (queryError) throw queryError;
      const sorted = [...(data ?? [])].sort((a, b) => Number(b.is_primary) - Number(a.is_primary) || a.position - b.position);
      const paths = sorted.map((row) => row.storage_path).filter((path): path is string => Boolean(path));
      const signed = await signedUrls(MEDIA_BUCKET, paths);
      const urls = sorted
        .map((row) => (row.storage_path ? signed[row.storage_path] : null) ?? row.url ?? null)
        .filter((url): url is string => Boolean(url));
      if (!active) return;
      setPhotos(urls);
      if (!urls.length) setError("Adaugă cel puțin o fotografie pentru a crea posterul.");
    })().catch((reason: unknown) => {
      if (active) setError(reason instanceof Error ? reason.message : "Fotografiile nu au putut fi încărcate.");
    }).finally(() => {
      if (active) setLoadingPhotos(false);
    });
    return () => { active = false; };
  }, [props.open, props.propertyId]);

  const details = useMemo(() => [
    props.rooms ? `${props.rooms} ${props.rooms === 1 ? "cameră" : "camere"}` : null,
    props.surface ? `${new Intl.NumberFormat("ro-RO", { maximumFractionDigits: 0 }).format(props.surface)} mp` : null,
    props.floor ? `Etaj ${props.floor}` : null,
  ].filter((v): v is string => Boolean(v)), [props.rooms, props.surface, props.floor]);

  const hasLogo = Boolean(props.logoUrl);
  const hasAvatar = Boolean(avatarUrl);
  const photoIndex = Math.min(s.photoIndex, Math.max(0, photos.length - 1));
  const accent = normalizeHex(s.accent) ?? DEFAULT_POSTER_COLORS.accent;
  const background = normalizeHex(s.background) ?? DEFAULT_POSTER_COLORS.background;
  const textColor = normalizeHex(s.text) ?? DEFAULT_POSTER_COLORS.text;
  const lowContrast = contrastRatio(textColor, background) < 4.5;
  const lowAccentContrast = contrastRatio(accent, background) < 3;

  useEffect(() => {
    if (!props.open || !photos[photoIndex] || !canvasRef.current) return;
    let active = true;
    setRendering(true);
    const timer = window.setTimeout(() => {
      if (!canvasRef.current) return;
      void renderSocialPoster(canvasRef.current, {
        format: s.format,
        photoUrl: photos[photoIndex],
        logoUrl: s.logoOn && hasLogo ? props.logoUrl : null,
        logoBackground: s.logoBackground,
        label: s.labelOn && s.labelText.trim() ? s.labelText.trim() : null,
        overtitle: s.overtitleOn && s.overtitleText.trim() ? s.overtitleText.trim() : null,
        title: s.title || props.title,
        titleScale: s.titleScale / 100,
        location: s.locationOn && s.locationText.trim() ? s.locationText.trim() : null,
        price: s.priceOn && s.priceText.trim() ? s.priceText.trim() : null,
        oldPrice: s.priceOn && s.oldPriceOn && s.oldPriceText.trim() ? s.oldPriceText.trim() : null,
        viewing: formatViewing(s.viewingDateOn ? s.viewingDate : null, s.viewingTimeOn ? s.viewingTime : null),
        details: s.detailsOn ? details : [],
        agent: s.agentOn && props.agentName ? { name: props.agentName, phone: props.phone, photoUrl: avatarUrl } : null,
        bigAgentPhotoUrl: s.bigPhotoOn && avatarUrl ? avatarUrl : null,
        stamp: s.stampOn ? POSTER_STAMPS[s.stamp] : null,
        colors: { accent, background, text: textColor },
      }).then(() => { if (active) setError(null); }).catch((reason: unknown) => {
        if (active) setError(reason instanceof Error ? reason.message : "Previzualizarea nu a putut fi creată.");
      }).finally(() => {
        if (active) setRendering(false);
      });
    }, 120);
    return () => { active = false; window.clearTimeout(timer); };
  }, [props.open, photos, photoIndex, s, details, hasLogo, props.logoUrl, props.title, props.agentName, props.phone, avatarUrl, accent, background, textColor]);

  const save = () => {
    try {
      window.localStorage.setItem(propertyKey, JSON.stringify(s));
      const style = Object.fromEntries(STYLE_KEYS.map((key) => [key, s[key]]));
      window.localStorage.setItem(styleKey, JSON.stringify(style));
      toast.success("Setările posterului au fost salvate.");
    } catch {
      toast.error("Setările nu au putut fi salvate în acest browser.");
    }
  };

  const download = () => {
    if (!canvasRef.current || rendering || error) return;
    downloadPoster(canvasRef.current, posterFileName(s.format, s.title || props.title));
    toast.success("Posterul PNG a fost descărcat.");
  };

  const setTransaction = (t: SocialPosterTransaction) =>
    update({
      transaction: t,
      labelText: s.labelText === labelFor(s.transaction) ? labelFor(t) : s.labelText,
      priceText: s.priceText === priceFor(s.transaction) ? priceFor(t) : s.priceText,
    });

  const size = SOCIAL_POSTER_SIZES[s.format];

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="flex h-[100dvh] w-screen max-w-none flex-col gap-0 overflow-hidden p-0 sm:h-[94vh] sm:w-[96vw] sm:max-w-[1440px] [&>button:last-child]:hidden">
        <DialogHeader className="sr-only">
          <DialogTitle>Poster</DialogTitle>
          <DialogDescription>Editor de poster pentru rețele sociale. Imaginea se descarcă, nu se publică.</DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-2 sm:px-4">
          <Button variant="ghost" size="sm" onClick={() => props.onOpenChange(false)}><X className="size-4" />Închide</Button>
          <h2 className="mr-auto font-sans text-base font-bold">Poster</h2>
          <Select value={s.format} onValueChange={(value) => update({ format: value as SocialPosterFormat })}>
            <SelectTrigger className="h-9 w-[190px]" aria-label="Format"><SelectValue /></SelectTrigger>
            <SelectContent>
              {SOCIAL_POSTER_FORMATS.map((f) => (
                <SelectItem key={f.value} value={f.value}>{f.label} · {SOCIAL_POSTER_SIZES[f.value].width}×{SOCIAL_POSTER_SIZES[f.value].height}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={save}><Save className="size-4" />Salvează</Button>
          <Button variant="outline" size="sm" onClick={() => setPhotoPickerOpen(true)} disabled={!photos.length}><ImageIcon className="size-4" />Poza</Button>
          <Button size="sm" onClick={download} disabled={!photos.length || rendering || Boolean(error)}><Download className="size-4" />Descarcă</Button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto lg:grid lg:grid-cols-[minmax(0,1fr)_400px] lg:overflow-hidden">
          <div className="flex min-h-[48vh] items-center justify-center bg-muted p-4 lg:h-full lg:min-h-0">
            {loadingPhotos ? <Loader2 className="size-7 animate-spin text-muted-foreground" aria-label="Se încarcă fotografiile" /> : null}
            {!loadingPhotos && photos.length ? (
              <div className="relative flex h-full max-h-[46vh] w-full items-center justify-center lg:max-h-full">
                <canvas
                  ref={canvasRef}
                  width={size.width}
                  height={size.height}
                  className="block max-h-full max-w-full rounded-md shadow-lg"
                  style={{ aspectRatio: `${size.width} / ${size.height}` }}
                  aria-label="Previzualizare poster"
                />
                {rendering ? <div className="pointer-events-none absolute right-2 top-2"><Loader2 className="size-5 animate-spin text-muted-foreground" /></div> : null}
              </div>
            ) : null}
            {!loadingPhotos && !photos.length ? <div className="max-w-xs text-center text-sm text-muted-foreground"><ImageIcon className="mx-auto mb-3 size-8" />Adaugă cel puțin o fotografie pentru a crea posterul.</div> : null}
          </div>

          <div className="space-y-6 border-t border-border p-4 lg:h-full lg:overflow-y-auto lg:border-l lg:border-t-0">
            {error ? <p className="text-sm text-destructive" role="alert">{error}</p> : null}

            {props.forSale && props.forRent ? (
              <div className="space-y-2">
                <Label htmlFor="poster-transaction">Tranzacție</Label>
                <Select value={s.transaction} onValueChange={(value) => setTransaction(value as SocialPosterTransaction)}>
                  <SelectTrigger id="poster-transaction"><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="sale">De vânzare</SelectItem><SelectItem value="rent">De închiriat</SelectItem></SelectContent>
                </Select>
              </div>
            ) : null}

            <Section title="Text">
              <ToggleText label="Etichetă" checked={s.labelOn} onChecked={(v) => update({ labelOn: v })} value={s.labelText} onValue={(v) => update({ labelText: v })} />
              <ToggleText label="Supratitlu" checked={s.overtitleOn} onChecked={(v) => update({ overtitleOn: v })} value={s.overtitleText} onValue={(v) => update({ overtitleText: v })} />
              <div className="space-y-1.5">
                <Label htmlFor="poster-title">Titlu</Label>
                <Input id="poster-title" value={s.title} onChange={(e) => update({ title: e.target.value })} onBlur={() => update({ title: cleanPosterTitle(s.title) })} />
              </div>
              <ToggleText label="Locație" checked={s.locationOn} onChecked={(v) => update({ locationOn: v })} value={s.locationText} onValue={(v) => update({ locationText: v })} />
              <ToggleText label="Preț" checked={s.priceOn} onChecked={(v) => update({ priceOn: v })} value={s.priceText} onValue={(v) => update({ priceText: v })} />
              <ToggleText label="Preț vechi tăiat" checked={s.oldPriceOn} disabled={!s.priceOn} onChecked={(v) => update({ oldPriceOn: v })} value={s.oldPriceText} placeholder="ex. 85.000€" onValue={(v) => update({ oldPriceText: v })} />
              <ToggleText label="Data vizionării" type="date" checked={s.viewingDateOn} onChecked={(v) => update({ viewingDateOn: v })} value={s.viewingDate} onValue={(v) => update({ viewingDate: v })} />
              <ToggleText label="Ora" type="time" checked={s.viewingTimeOn} onChecked={(v) => update({ viewingTimeOn: v })} value={s.viewingTime} onValue={(v) => update({ viewingTime: v })} />
              <div className="space-y-2">
                <div className="flex items-center justify-between"><Label>Mărime titlu</Label><span className="text-xs text-muted-foreground">{s.titleScale}%</span></div>
                <Slider min={60} max={120} step={5} value={[s.titleScale]} onValueChange={([v]) => update({ titleScale: v })} aria-label="Mărime titlu" />
              </div>
            </Section>

            <Section title="Opțiuni">
              <OptionRow label="Detalii (camere / mp / etaj)" checked={s.detailsOn} disabled={!details.length} help={details.length ? undefined : "Anunțul nu are camere, suprafață sau etaj."} onCheckedChange={(v) => update({ detailsOn: v })} />
              <OptionRow label="Bloc agent" help={props.agentName ? "Numele, poza mică și telefonul agentului responsabil." : "Proprietatea nu are agent responsabil."} checked={s.agentOn && Boolean(props.agentName)} disabled={!props.agentName} onCheckedChange={(v) => update({ agentOn: v })} />
              <OptionRow label="Poza mea (mare)" help={hasAvatar ? "Poza de profil a agentului, lângă card." : "Adaugă o poză în Setări → Profil"} checked={s.bigPhotoOn && hasAvatar} disabled={!hasAvatar} onCheckedChange={(v) => update({ bigPhotoOn: v })} />
              <OptionRow label="Ștampilă" checked={s.stampOn} onCheckedChange={(v) => update({ stampOn: v })}>
                {s.stampOn ? (
                  <Select value={s.stamp} onValueChange={(v) => update({ stamp: v as PosterStamp })}>
                    <SelectTrigger className="mt-2" aria-label="Tip ștampilă"><SelectValue /></SelectTrigger>
                    <SelectContent>{(Object.keys(POSTER_STAMPS) as PosterStamp[]).map((key) => <SelectItem key={key} value={key}>{POSTER_STAMPS[key]}</SelectItem>)}</SelectContent>
                  </Select>
                ) : null}
              </OptionRow>
              <OptionRow label="Logo agenție" help={hasLogo ? undefined : "Adaugă un logo în Setări → Branding"} checked={s.logoOn && hasLogo} disabled={!hasLogo} onCheckedChange={(v) => update({ logoOn: v })} />
            </Section>

            <Section title="Culori">
              <ColorField label="Culoare accent" value={s.accent} presets={ACCENT_PRESETS} onChange={(v) => update({ accent: v })} />
              <ColorField label="Culoare fundal (card)" value={s.background} presets={BACKGROUND_PRESETS} onChange={(v) => update({ background: v })} />
              <ColorField label="Culoare text" value={s.text} presets={TEXT_PRESETS} onChange={(v) => update({ text: v })} />
              {lowContrast || lowAccentContrast ? (
                <p className="flex items-start gap-2 rounded-md border border-border bg-muted px-3 py-2 text-xs text-muted-foreground" role="status">
                  <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                  {lowContrast ? "Textul și fundalul cardului au contrast redus; textul poate fi greu de citit." : "Culoarea accent are contrast redus pe fundalul cardului."}
                </p>
              ) : null}
              <div className="space-y-1.5">
                <Label>Fundal logo</Label>
                <div className="grid grid-cols-3 gap-2">
                  {([["transparent", "Transparent"], ["white", "Alb"], ["dark", "Închis"]] as const).map(([value, label]) => (
                    <Button key={value} type="button" size="sm" variant={s.logoBackground === value ? "default" : "outline"} onClick={() => update({ logoBackground: value })}>{label}</Button>
                  ))}
                </div>
              </div>
            </Section>

            <p className="text-xs text-muted-foreground">Posterul folosește numai datele vizibile ale proprietății. Habitoo nu publică pe rețele sociale.</p>
          </div>
        </div>

        <Dialog open={photoPickerOpen} onOpenChange={setPhotoPickerOpen}>
          <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
            <DialogHeader>
              <DialogTitle>Alege poza</DialogTitle>
              <DialogDescription>Fotografia de fundal a posterului.</DialogDescription>
            </DialogHeader>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {photos.map((photo, index) => (
                <button key={photo} type="button" className={cn("aspect-square overflow-hidden rounded-md border border-border", photoIndex === index ? "ring-2 ring-ring ring-offset-2 ring-offset-background" : "")} onClick={() => { update({ photoIndex: index }); setPhotoPickerOpen(false); }} aria-label={`Alege fotografia ${index + 1}`} aria-pressed={photoIndex === index}>
                  <img src={photo} alt="" loading="lazy" className="h-full w-full object-cover" />
                </button>
              ))}
            </div>
          </DialogContent>
        </Dialog>
      </DialogContent>
    </Dialog>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-4">
      <h3 className="font-sans text-sm font-bold uppercase tracking-wide text-muted-foreground">{title}</h3>
      {children}
    </section>
  );
}

function ToggleText({ label, checked, disabled, onChecked, value, onValue, type = "text", placeholder }: {
  label: string; checked: boolean; disabled?: boolean; onChecked: (v: boolean) => void; value: string; onValue: (v: string) => void; type?: string; placeholder?: string;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-3">
        <Label>{label}</Label>
        <Switch checked={checked && !disabled} disabled={disabled} onCheckedChange={onChecked} aria-label={label} />
      </div>
      {checked && !disabled ? <Input type={type} value={value} placeholder={placeholder} onChange={(e) => onValue(e.target.value)} aria-label={`${label} — valoare`} /> : null}
    </div>
  );
}

function OptionRow({ label, help, checked, disabled, onCheckedChange, children }: { label: string; help?: string; checked: boolean; disabled?: boolean; onCheckedChange: (checked: boolean) => void; children?: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0"><p className="text-sm font-medium">{label}</p>{help ? <p className="text-xs text-muted-foreground">{help}</p> : null}</div>
        <Switch checked={checked} disabled={disabled} onCheckedChange={onCheckedChange} aria-label={label} />
      </div>
      {children}
    </div>
  );
}

function ColorField({ label, value, presets, onChange }: { label: string; value: string; presets: string[]; onChange: (v: string) => void }) {
  const valid = normalizeHex(value);
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <div className="flex items-center gap-2">
        <input type="color" value={valid ?? "#000000"} onChange={(e) => onChange(e.target.value.toUpperCase())} className="h-9 w-11 shrink-0 cursor-pointer rounded-md border border-border bg-background p-1" aria-label={`${label} — selector`} />
        <Input value={value} onChange={(e) => onChange(e.target.value)} onBlur={() => valid && onChange(valid)} className={cn("font-mono uppercase", valid ? "" : "border-destructive")} aria-label={`${label} — cod hex`} maxLength={7} />
      </div>
      <div className="flex flex-wrap gap-1.5">
        {presets.map((preset) => (
          <button key={preset} type="button" onClick={() => onChange(preset)} className={cn("size-7 rounded-full border border-border", valid === preset ? "ring-2 ring-ring ring-offset-2 ring-offset-background" : "")} style={{ backgroundColor: preset }} aria-label={`${label} ${preset}`} />
        ))}
      </div>
    </div>
  );
}
