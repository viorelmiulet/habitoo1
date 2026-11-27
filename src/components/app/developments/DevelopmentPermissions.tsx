import { useEffect, useState } from 'react';
import { useServerFn } from '@tanstack/react-start';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
import { toast } from '@/components/ui/sonner';
import { useCurrentUser } from '@/hooks/use-session';
import {
  getAgentDevelopmentPermissions,
  getMyDevelopmentPermissions,
  saveAgentDevelopmentPermissions,
} from '@/lib/developments/development-permissions.functions';

/** Whether the signed-in user may create developments; admins and superadmins always may. */
export function useCanCreateDevelopment(): boolean | null {
  const { data: user } = useCurrentUser();
  const load = useServerFn(getMyDevelopmentPermissions);
  const isAdmin = user?.isAdmin ?? false;
  const q = useQuery({ queryKey: ['my-development-permissions'], queryFn: () => load(), enabled: Boolean(user) && !isAdmin });
  if (!user) return null;
  if (isAdmin) return true;
  return q.data ? q.data.canCreate : null;
}

export function AgentDevelopmentPermissions({ userId }: { userId: string }) {
  const load = useServerFn(getAgentDevelopmentPermissions);
  const save = useServerFn(saveAgentDevelopmentPermissions);
  const qc = useQueryClient();
  const key = ['agent-development-permissions', userId];
  const q = useQuery({ queryKey: key, queryFn: () => load({ data: { userId } }) });
  const [canCreate, setCanCreate] = useState(false);
  const [portals, setPortals] = useState<string[]>([]);
  useEffect(() => {
    if (!q.data) return;
    setCanCreate(q.data.canCreate);
    setPortals(q.data.allowedPortals);
  }, [q.data]);
  const mutation = useMutation({
    mutationFn: () => save({ data: { userId, canCreate, allowedPortals: portals } }),
    onSuccess: () => { toast.success('Drepturile pentru ansambluri au fost salvate.'); void qc.invalidateQueries({ queryKey: key }); },
    onError: error => toast.error(error instanceof Error ? error.message : 'Drepturile nu au putut fi salvate.'),
  });
  const dirty = q.data ? canCreate !== q.data.canCreate || [...portals].sort().join() !== [...q.data.allowedPortals].sort().join() : false;

  return <section className="space-y-4 rounded-[14px] border border-border bg-card p-4 sm:p-5">
    <h2 className="text-base font-bold">Ansambluri</h2>
    {q.isLoading ? <p className="text-sm text-muted-foreground">Se încarcă…</p> : q.isError ? <p role="alert" className="text-sm text-destructive">Drepturile nu au putut fi citite.</p> : <>
      <label className="flex min-h-11 items-center gap-3">
        <Switch aria-label="Poate crea ansambluri" checked={canCreate} onCheckedChange={setCanCreate} />
        <span className="text-sm">Poate crea ansambluri</span>
      </label>
      <div className="space-y-2">
        <p className="text-sm font-medium">Poate publica ansambluri pe</p>
        {q.data?.portals.length ? <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{q.data.portals.map(portal =>
          <label key={portal.id} className="flex min-h-11 items-center gap-2 text-sm">
            <Checkbox aria-label={portal.name} checked={portals.includes(portal.id)} onCheckedChange={value => setPortals(current => value === true ? [...new Set([...current, portal.id])] : current.filter(id => id !== portal.id))} />
            <span>{portal.name}</span>
          </label>)}</div> : <p className="text-sm text-muted-foreground">Agenția nu are portaluri eligibile pentru ansambluri.</p>}
      </div>
      <Button type="button" disabled={!dirty || mutation.isPending} onClick={() => mutation.mutate()}>Salvează drepturile</Button>
    </>}
  </section>;
}
