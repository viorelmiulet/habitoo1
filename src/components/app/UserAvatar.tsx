import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { initials } from "@/lib/format";
import { AVATAR_BUCKET, signedUrl } from "@/lib/storage";

/** Rezolvă un URL semnat pentru fotografia de profil stocată privat. */
export function useAvatarUrl(path?: string | null) {
  const { data } = useQuery({
    queryKey: ["avatar-url", path],
    queryFn: () => signedUrl(AVATAR_BUCKET, path as string, 3600),
    enabled: Boolean(path),
    staleTime: 45 * 60_000,
  });
  return data ?? null;
}

type Props = {
  name?: string | null;
  path?: string | null;
  className?: string;
  textClassName?: string;
};

/** Fotografie de profil cu inițiale ca fallback. */
export function UserAvatar({ name, path, className, textClassName }: Props) {
  const url = useAvatarUrl(path);
  const label = name || "Utilizator";

  return (
    <span
      className={cn(
        "flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary/10 text-xs font-semibold text-primary",
        className,
      )}
    >
      {url ? (
        <img
          src={url}
          alt={`Fotografia de profil a lui ${label}`}
          className="size-full object-cover"
        />
      ) : (
        <span className={textClassName}>{initials(label)}</span>
      )}
    </span>
  );
}
