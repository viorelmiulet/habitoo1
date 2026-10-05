import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AGENCY_LOGO_BUCKET, signedUrls } from "@/lib/storage";
import { initials } from "@/lib/superadmin-status";
import { cn } from "@/lib/utils";

export function useAgencyLogoUrls(paths: (string | null | undefined)[]) {
  const unique = [...new Set(paths.filter((path): path is string => Boolean(path)))].sort();
  const key = unique.join("\u0000");
  const { data } = useQuery({
    queryKey: ["superadmin", "agency-logo-urls", key],
    queryFn: () => signedUrls(AGENCY_LOGO_BUCKET, unique, 7 * 24 * 3600),
    enabled: unique.length > 0,
    staleTime: 60 * 60_000,
  });
  return data ?? {};
}

export function AgencyLogo({
  name,
  path,
  urls,
  size = "list",
  className,
}: {
  name: string;
  path?: string | null;
  urls: Record<string, string>;
  size?: "small" | "list" | "detail";
  className?: string;
}) {
  const url = path ? urls[path] : null;
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [url]);

  const sizeClass = size === "detail" ? "size-[72px] rounded-[16px]" : size === "small" ? "size-7 rounded-lg" : "size-12 rounded-xl";
  const textClass = size === "detail" ? "text-lg" : size === "small" ? "text-[10px]" : "text-sm";

  if (url && !failed) {
    return (
      <span className={cn("grid shrink-0 place-items-center overflow-hidden border border-border bg-card p-1", sizeClass, className)}>
        <img
          src={url}
          alt={`Logo ${name}`}
          loading="lazy"
          className="size-full object-contain"
          onError={() => setFailed(true)}
        />
      </span>
    );
  }

  return (
    <span className={cn("grid shrink-0 place-items-center bg-gold/15 font-semibold text-foreground", sizeClass, textClass, className)} aria-hidden>
      {initials(name)}
    </span>
  );
}