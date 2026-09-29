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
import { setPlatformUserAvatar } from "@/lib/superadmin-users.functions";

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(",")[1] ?? "");
    r.onerror = () => reject(new Error("Imaginea nu a putut fi citită."));
    r.readAsDataURL(blob);
  });
}

/** Poza de profil a unui utilizator, editată de superadmin (aceleași reguli ca la Setări → Profil). */
export function UserAvatarEditor({
  userId,
  name,
  initialPath,
}: {
  userId: string;
  name: string;
  initialPath: string | null;
}) {
  const queryClient = useQueryClient();
  const setAvatar = useServerFn(setPlatformUserAvatar);
  const [path, setPath] = useState<string | null>(initialPath);

  const mutation = useMutation({
    mutationFn: async (file: File | null) => {
      if (file) {
        if (!AVATAR_TYPES.includes(file.type)) throw new Error("Folosește o imagine JPG, PNG sau WebP.");
        if (file.size > AVATAR_MAX_BYTES) throw new Error("Imaginea depășește 5 MB.");
        const { blob } = await compressImage(file, 512, 0.85);
        return setAvatar({ data: { userId, jpegBase64: await blobToBase64(blob) } });
      }
      return setAvatar({ data: { userId, jpegBase64: null } });
    },
    onSuccess: (r) => {
      setPath(r.avatarUrl);
      queryClient.invalidateQueries({ queryKey: ["superadmin", "users"] });
      toast.success(r.avatarUrl ? "Fotografia a fost actualizată." : "Fotografia a fost ștearsă.");
    },
    onError: (e: Error) => toastError(e),
  });

  return (
    <div className="flex items-center gap-3">
      <UserAvatar name={name} path={path} />
      <div className="grid gap-1.5">
        <Label htmlFor="u-avatar">Fotografie de profil</Label>
        <div className="flex items-center gap-2">
          <Input
            id="u-avatar"
            type="file"
            accept={AVATAR_TYPES.join(",")}
            disabled={mutation.isPending}
            className="max-w-xs"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) mutation.mutate(f);
              e.target.value = "";
            }}
          />
          {path ? (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={mutation.isPending}
              onClick={() => mutation.mutate(null)}
            >
              <Trash2 className="mr-1.5 size-4" />
              Șterge
            </Button>
          ) : null}
        </div>
        <p className="text-xs text-muted-foreground">JPG, PNG sau WebP, max. 5 MB.</p>
      </div>
    </div>
  );
}
