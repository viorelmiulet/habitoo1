import habitooIdentity from "@/assets/habitoo-identity.webp.asset.json";
import habitooLogo from "@/assets/habitoo-logo.webp.asset.json";
import { cn } from "@/lib/utils";

type BrandLogoProps = {
  className?: string;
  fullIdentity?: boolean;
  markOnly?: boolean;
  priority?: boolean;
};

export function BrandLogo({
  className,
  fullIdentity = false,
  markOnly = false,
  priority = false,
}: BrandLogoProps) {
  return (
    <img
      src={markOnly ? "/favicon.png" : fullIdentity ? habitooIdentity.url : habitooLogo.url}
      alt="Habitoo CRM"
      className={cn("block h-auto max-w-full object-contain", className)}
      loading={priority ? "eager" : "lazy"}
      decoding="async"
    />
  );
}
