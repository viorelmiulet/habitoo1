import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { syncOrganizationFromCui } from "@/lib/company-lookup.functions";
import { shouldSyncOrg } from "@/lib/company-lookup";
import { currentUserQueryKey } from "@/hooks/use-session";

type Org = { cui?: string | null; company_verified_at?: string | null; company_sync_attempted_at?: string | null };

/** Completează în fundal datele firmei din ANAF (doar câmpurile goale), cel mult o dată pe zi. */
export function CompanyAnafSync({ org }: { org: Org | null }) {
  const sync = useServerFn(syncOrganizationFromCui);
  const queryClient = useQueryClient();
  const done = useRef(false);
  useEffect(() => {
    if (done.current || !org || !shouldSyncOrg(org, new Date())) return;
    done.current = true;
    sync()
      .then((r) => {
        if (r.status === "verified") void queryClient.invalidateQueries({ queryKey: currentUserQueryKey });
      })
      .catch(() => undefined);
  }, [org, sync, queryClient]);
  return null;
}
