import { Building2 } from "lucide-react";
import { cn } from "@/lib/utils";

export function BlogCover({ src, alt, eager = false, className }: { src: string | null; alt: string; eager?: boolean; className?: string }) {
  if (!src) return <div role="img" aria-label={alt} className={cn("flex aspect-video items-center justify-center bg-gradient-to-br from-gold-tint via-background to-gold/35", className)}><Building2 className="size-12 text-gold-dark" aria-hidden /></div>;
  return <img src={src} alt={alt} loading={eager ? "eager" : "lazy"} className={cn("aspect-video w-full object-cover", className)} />;
}
