import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Trash2 } from "lucide-react";

import { toast } from "@/components/ui/sonner";
import { toastError } from "@/lib/errors";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { UserAvatar } from "@/components/app/UserAvatar";
import { AVATAR_MAX_BYTES, AVATAR_TYPES, compressImage } from "@/lib/storage";
import { currentUserQueryKey } from "@/hooks/use-session";
import { notifyProperstarFeedChanged } from "@/lib/portals/properstar-cache";
import { fullNameSchema, mobilePhoneSchema } from "@/lib/user-profile";
import { setUserProfileAvatar, updateUserProfile } from "@/lib/user-profile.functions";

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(",")[1] ?? "");
    r.onerror = () => reject(new Error("Imaginea nu a putut fi citită."));
    r.readAsDataURL(blob);
  });
}

export type EditableProfile = {
  id: string;
  full_name: string | null;
  phone: string | null;
  job_title: string | null;
  avatar_url: string | null;
  email: string | null;
};

/** Formularul unic de profil: Setări › Profil, Echipă › Editează și ecranul obligatoriu. */
export function ProfileEditForm({
  profile,
  submitLabel = "Salvează profilul",
  showJobTitle = true,
  onSaved,
}: {
  profile: EditableProfile;
  submitLabel?: string;
  showJobTitle?: boolean;
  onSaved?: () => void;
}) {
  const queryClient = useQueryClient();
  const save = useServerFn(updateUserProfile);
  const setAvatar = useServerFn(setUserProfileAvatar);
  const [avatar, setAvatarPath] = useState(profile.avatar_url);
  const [form, setForm] = useState({
    full_name: profile.full_name ?? "",
    phone: profile.phone ?? "",
    job_title: profile.job_title ?? "",
  });
  const [errors, setErrors] = useState<{ full_name?: string; phone?: string }>({});

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: currentUserQueryKey });
    queryClient.invalidateQueries({ queryKey: ["agency", "team"] });
    queryClient.invalidateQueries({ queryKey: ["team"] });
    notifyProperstarFeedChanged();
  };

  const avatarMutation = useMutation({
    mutationFn: async (file: File | null) => {
      if (!file) return setAvatar({ data: { userId: profile.id, jpegBase64: null } });
      if (!AVATAR_TYPES.includes(file.type)) throw new Error("Folosește o imagine JPG, PNG sau WebP.");
      if (file.size > AVATAR_MAX_BYTES) throw new Error("Imaginea depășește 5 MB.");
      const { blob } = await compressImage(file, 512, 0.85);
      return setAvatar({ data: { userId: profile.id, jpegBase64: await blobToBase64(blob) } });
    },
    onSuccess: (r) => {
      setAvatarPath(r.avatarUrl);
      invalidate();
      toast.success(r.avatarUrl ? "Fotografia a fost actualizată." : "Fotografia a fost ștearsă.");
    },
    onError: (e: Error) => toastError(e),
  });

  const submit = useMutation({
    mutationFn: async () => {
      const next: typeof errors = {};
      const n = fullNameSchema.safeParse(form.full_name);
      if (!n.success) next.full_name = n.error.issues[0]?.message;
      const p = mobilePhoneSchema.safeParse(form.phone);
      if (!p.success) next.phone = p.error.issues[0]?.message;
      setErrors(next);
      if (Object.keys(next).length) throw new Error("Verifică câmpurile marcate.");
      await save({
        data: {
          userId: profile.id,
          full_name: form.full_name,
          phone: form.phone,
          job_title: showJobTitle ? form.job_title || null : (profile.job_title ?? null),
        },
      });
    },
    onSuccess: () => {
      invalidate();
      toast.success("Profilul a fost salvat.");
      onSaved?.();
    },
    onError: (e: Error) => toastError(e),
  });

  const id = (s: string) => `pf-${profile.id.slice(0, 8)}-${s}`;

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        submit.mutate();
      }}
    >
      <div className="flex items-center gap-4">
        <UserAvatar name={form.full_name || profile.email} path={avatar} className="size-16 text-base" />
        <div className="space-y-1">
          <Label htmlFor={id("avatar")}>Fotografie de profil</Label>
          <div className="flex flex-wrap items-center gap-2">
            <Input
              id={id("avatar")}
              type="file"
              accept={AVATAR_TYPES.join(",")}
              disabled={avatarMutation.isPending}
              className="max-w-xs"
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (f) avatarMutation.mutate(f);
              }}
            />
            {avatar ? (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={avatarMutation.isPending}
                onClick={() => avatarMutation.mutate(null)}
              >
                <Trash2 className="mr-1.5 size-4" />
                Șterge
              </Button>
            ) : null}
          </div>
          <p className="text-xs text-muted-foreground">JPG, PNG sau WebP, maximum 5 MB.</p>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor={id("name")}>Nume complet *</Label>
        <Input
          id={id("name")}
          value={form.full_name}
          aria-invalid={Boolean(errors.full_name)}
          onChange={(e) => setForm((f) => ({ ...f, full_name: e.target.value }))}
        />
        {errors.full_name ? <p className="text-xs text-destructive">{errors.full_name}</p> : null}
      </div>
      <div className="space-y-2">
        <Label htmlFor={id("phone")}>Telefon mobil *</Label>
        <Input
          id={id("phone")}
          type="tel"
          inputMode="tel"
          placeholder="0722 123 456"
          value={form.phone}
          aria-invalid={Boolean(errors.phone)}
          onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
        />
        {errors.phone ? <p className="text-xs text-destructive">{errors.phone}</p> : null}
      </div>
      {showJobTitle ? (
        <div className="space-y-2">
          <Label htmlFor={id("job")}>Funcție</Label>
          <Input
            id={id("job")}
            value={form.job_title}
            onChange={(e) => setForm((f) => ({ ...f, job_title: e.target.value }))}
          />
        </div>
      ) : null}
      <div className="space-y-2">
        <Label>Email de autentificare</Label>
        <Input value={profile.email ?? ""} disabled />
      </div>
      <div className="flex justify-end">
        <Button type="submit" disabled={submit.isPending}>
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}
