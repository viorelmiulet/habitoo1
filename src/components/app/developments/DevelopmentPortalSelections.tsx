import { useEffect, useMemo, useRef, useState } from 'react';
import { useServerFn } from '@tanstack/react-start';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  getDevelopmentPortalSelections,
  getDevelopmentPortalStates,
  setDevelopmentPortalSelections,
} from '@/lib/developments/portal-selections.functions';
import { UNIT_OPERATION_STARTED, type UnitOperationResult } from '@/lib/developments/unit-operations';
import { toast } from '@/components/ui/sonner';
import { errorMessage } from '@/lib/developments/error-message';

type PendingChange = { portalKey: string; enabled: boolean };

export function DevelopmentPortalSelections({ id, editable, storiaConnected, missingPageContent = false }: { id: string; editable: boolean; storiaConnected: boolean; missingPageContent?: boolean }) {
  const load = useServerFn(getDevelopmentPortalSelections);
  const loadStates = useServerFn(getDevelopmentPortalStates);
  const save = useServerFn(setDevelopmentPortalSelections);
  const qc = useQueryClient();
  const [draft, setDraft] = useState<Record<string, boolean>>({});
  const q = useQuery({
    queryKey: ['development-portal-selections', id],
    queryFn: () => load({ data: { id } }),
    refetchInterval: 3000,
  });
  const states = useQuery({
    queryKey: ['development-portal-states', id],
    queryFn: () => loadStates({ data: { id } }),
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
  const wasRunning = useRef(running);
  const refetchStates = states.refetch;
  useEffect(() => {
    if (wasRunning.current && !running) void refetchStates();
    wasRunning.current = running;
  }, [running, refetchStates]);
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
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h2 className="text-lg font-semibold">Portaluri ansamblu</h2>
      <Button type="button" variant="outline" size="sm" disabled={states.isFetching} onClick={() => void states.refetch()}>
        Actualizează starea
      </Button>
    </div>
    {missingPageContent ? <p className="text-sm text-muted-foreground">Fără descriere și fotografie, unele portaluri nu afișează pagina ansamblului.</p> : null}
    {q.isError ? <p role="alert" className="text-sm text-destructive">Portalurile ansamblului nu au putut fi citite.</p> : null}
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{q.data?.portals.map(portal => {
      const enabled = draft[portal.id] ?? saved.get(portal.id) ?? false;
      const status = states.data?.portals.find(item => item.portalId === portal.id);
      const showStatus = saved.get(portal.id) === true && status;
      const notAllowed = Boolean(q.data?.allowedPortals) && !q.data?.allowedPortals?.includes(portal.id) && !enabled;
      const developmentLabel = status?.developmentState === 'published' ? 'Publicat' : status?.developmentState === 'error' ? 'Cu erori' : 'Nepublicat';
      return <label key={portal.id} className="flex min-h-11 items-start gap-2">
        <Checkbox
          className="mt-0.5"
          aria-label={portal.id === 'storia' ? 'Storia — Cont dezvoltator' : portal.name}
          checked={enabled}
          disabled={!editable || mutation.isPending || running || (portal.id === 'storia' && !storiaConnected && !enabled) || notAllowed}
          onCheckedChange={value => setChecked(portal.id, value === true)}
        />
        <span>
          <span>{portal.id === 'storia' ? 'Storia — Cont dezvoltator' : portal.name}</span>
          {notAllowed ? <span className="block text-xs text-muted-foreground">Nepermis de administrator</span> : null}
          {showStatus ? <span className="block text-xs text-muted-foreground">
            {status.covered
              ? `${status.published} din ${status.total} unități publicate${status.errors ? ` · ${status.errors} cu erori` : ''}`
              : `${status.selected} din ${status.total} unități bifate`}
          </span> : null}
          {showStatus && status.developmentState ? <span className="block text-xs text-muted-foreground">Ansamblul: {developmentLabel}</span> : null}
        </span>
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
