import { useMemo, useState } from 'react';
import { useServerFn } from '@tanstack/react-start';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  getDevelopmentPortalSelections,
  setDevelopmentPortalSelections,
} from '@/lib/developments/portal-selections.functions';
import { UNIT_OPERATION_STARTED, type UnitOperationResult } from '@/lib/developments/unit-operations';
import { toast } from '@/components/ui/sonner';
import { errorMessage } from '@/lib/developments/error-message';

type PendingChange = { portalKey: string; enabled: boolean };

export function DevelopmentPortalSelections({ id, editable, storiaConnected }: { id: string; editable: boolean; storiaConnected: boolean }) {
  const load = useServerFn(getDevelopmentPortalSelections);
  const save = useServerFn(setDevelopmentPortalSelections);
  const qc = useQueryClient();
  const [draft, setDraft] = useState<Record<string, boolean>>({});
  const q = useQuery({
    queryKey: ['development-portal-selections', id],
    queryFn: () => load({ data: { id } }),
    refetchInterval: 3000,
  });

  const saved = useMemo(
    () => new Map((q.data?.selections ?? []).map(selection => [selection.portal_key, selection.enabled])),
    [q.data?.selections],
  );
  const changes = useMemo<PendingChange[]>(
    () => (q.data?.portals ?? []).flatMap(portal => {
      const previous = saved.get(portal.id) ?? false;
      const enabled = draft[portal.id] ?? previous;
      return enabled === previous ? [] : [{ portalKey: portal.id, enabled }];
    }),
    [draft, q.data?.portals, saved],
  );

  const mutation = useMutation({
    mutationFn: (pending: PendingChange[]) => save({ data: { id, changes: pending } }),
    onSuccess: result => {
      setDraft({});
      if (result.jobId) toast.success(UNIT_OPERATION_STARTED);
      void q.refetch();
      void qc.invalidateQueries({ queryKey: ['development-publishing', id] });
    },
    onError: error => toast.error(errorMessage(error, 'Selecțiile nu au putut fi salvate.')),
  });

  const running = q.data?.job ? ['queued', 'running'].includes(q.data.job.status) : false;
  const result = q.data?.job?.result as unknown as UnitOperationResult | undefined;
  const portalName = (portalKey: string) => q.data?.portals.find(portal => portal.id === portalKey)?.name ?? portalKey;
  const operationChanges = q.data?.job?.changes ?? (q.data?.job ? [{ portal_key: q.data.job.portal_key, enabled: q.data.job.enabled }] : []);
  const operationNames = operationChanges.map(change => portalName(change.portal_key)).join(', ');

  const setChecked = (portalKey: string, enabled: boolean) => {
    setDraft(current => {
      const next = { ...current };
      if (enabled === (saved.get(portalKey) ?? false)) delete next[portalKey];
      else next[portalKey] = enabled;
      return next;
    });
  };

  const applyChanges = () => {
    if (!changes.length) return;
    const withdrawals = changes.filter(change => !change.enabled).map(change => portalName(change.portalKey));
    if (withdrawals.length && !window.confirm(`Retragi unitățile ansamblului de pe: ${withdrawals.join(', ')}?`)) return;
    mutation.mutate(changes);
  };

  return <section className="space-y-3 border-b pb-5">
    <h2 className="text-lg font-semibold">Portaluri ansamblu</h2>
    {q.isError ? <p role="alert" className="text-sm text-destructive">Portalurile ansamblului nu au putut fi citite.</p> : null}
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{q.data?.portals.map(portal => {
      const enabled = draft[portal.id] ?? saved.get(portal.id) ?? false;
      return <label key={portal.id} className="flex min-h-11 items-center gap-2">
        <Checkbox
          aria-label={portal.id === 'storia' ? 'Storia — Cont dezvoltator' : portal.name}
          checked={enabled}
          disabled={!editable || mutation.isPending || running || (portal.id === 'storia' && !storiaConnected && !enabled)}
          onCheckedChange={value => setChecked(portal.id, value === true)}
        />
        <span>{portal.id === 'storia' ? 'Storia — Cont dezvoltator' : portal.name}</span>
      </label>;
    })}</div>
    {changes.length ? <p className="text-sm text-muted-foreground" aria-live="polite">
      {changes.length === 1 ? '1 modificare de aplicat' : `${changes.length} modificări de aplicat`}
    </p> : null}
    <div className="flex flex-wrap items-center gap-2">
      <Button type="button" disabled={!editable || !changes.length || mutation.isPending || running} onClick={applyChanges}>
        Salvează și publică
      </Button>
      {changes.length ? <Button type="button" variant="link" disabled={mutation.isPending || running} onClick={() => setDraft({})}>
        Renunță la modificări
      </Button> : null}
    </div>
    {q.data?.job ? <div className="space-y-2 text-sm">
      <h3 className="font-medium">Ultima operație — {operationNames}</h3>
      {running ? <>
        <p aria-live="polite">În curs: {q.data.job.processed} din {q.data.job.total} unități</p>
        <p className="text-muted-foreground">Portaluri: {operationNames}</p>
      </> : <p>
        {result?.succeeded?.filter(item => !('skip' in item && item.skip)).length ?? 0} unități procesate, {result?.succeeded?.filter(item => 'skip' in item && item.skip).length ?? 0} sărite, {(result?.failed?.length ?? 0) + (q.data.job.status === 'error' ? q.data.job.total - q.data.job.processed : 0)} eșuate.
      </p>}
      {q.data.job.last_error ? <p className="text-destructive">{q.data.job.last_error}</p> : null}
      {result?.failed?.map((item, index) => <p key={`${item.propertyId}-${index}`} className="text-destructive">{item.reference ?? item.propertyId}: {item.reason}</p>)}
    </div> : null}
  </section>;
}
