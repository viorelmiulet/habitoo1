import type { ReactNode } from "react";

import { getCurrentHostname } from "@/lib/current-host";
import { crmHref } from "@/lib/host";

/**
 * Link din site-ul public către aplicația CRM (crm.habitoo.ro).
 * Pe domeniile de producție produce URL absolut pe subdomeniul CRM;
 * pe preview/local rămâne o cale relativă, ca fluxurile să fie testabile.
 */
export function CrmLink({
  to,
  children,
  className,
  onClick,
  "aria-label": ariaLabel,
}: {
  to: string;
  children: ReactNode;
  className?: string;
  onClick?: () => void;
  "aria-label"?: string;
}) {
  return (
    <a
      href={crmHref(to, getCurrentHostname())}
      className={className}
      onClick={onClick}
      aria-label={ariaLabel}
    >
      {children}
    </a>
  );
}
