/** Selectorul de agenție comun paginilor Portaluri și Setări portaluri; rămâne lipit sus la derulare. */
import { InlineLoading } from "@/components/app/LoadingState";
import { QueryError } from "@/components/app/QueryError";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type Props = {
  value: string;
  onChange: (id: string) => void;
  orgs: {
    isLoading: boolean;
    isError: boolean;
    error: unknown;
    data?: { id: string; name: string }[];
    refetch: () => unknown;
  };
};

export function PortalOrgSelector({ value, onChange, orgs }: Props) {
  return (
    <div className="sticky top-0 z-20 -mx-1 bg-background/95 px-1 py-2 backdrop-blur">
      <div className="panel space-y-3 p-5">
        <Label htmlFor="portal-org">Agenție</Label>
        {orgs.isLoading ? (
          <InlineLoading label="Se încarcă agențiile…" />
        ) : orgs.isError ? (
          <QueryError error={orgs.error as Error} onRetry={() => orgs.refetch()} />
        ) : (
          <Select value={value} onValueChange={onChange}>
            <SelectTrigger id="portal-org" className="max-w-md">
              <SelectValue placeholder="Alege agenția" />
            </SelectTrigger>
            <SelectContent>
              {(orgs.data ?? []).map((o) => (
                <SelectItem key={o.id} value={o.id}>
                  {o.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>
    </div>
  );
}
