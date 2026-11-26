import type { PGlite } from '@electric-sql/pglite';
/** Test-only PostgREST-shaped adapter over isolated PostgreSQL; never used by the app. */
export function mvaLeadTestDb(pg: PGlite) {
  const calls: { name: string; args: Record<string, unknown> }[] = [];
  const identifier = (value: string) => {
    if (!/^[a-z_][a-z0-9_]*$/i.test(value)) throw new Error('Unsafe test identifier');
    return `"${value}"`;
  };
  return {
    calls,
    async rpc(name: string, args: Record<string, unknown> = {}) {
      calls.push({ name, args });
      if (name === 'start_mva_initial_sync') return { data: null, error: null };
      const names = Object.keys(args);
      const result = await pg.query<{ value: unknown }>(`select public.${identifier(name)}(${names.map((key, i) => `${identifier(key)} => $${i + 1}`).join(',')}) as value`, Object.values(args));
      return { data: result.rows[0]?.value, error: null };
    },
    from(table: string) {
      const clauses: { sql: (offset: number) => string; values: unknown[] }[] = [];
      let payload: Record<string, unknown> | null = null;
      let op = 'select'; let conflict = ''; let limit: number | null = null;
      const result = async () => {
        const values: unknown[] = [];
        const bind = (v: unknown) => { values.push(v && typeof v === 'object' ? JSON.stringify(v) : v); return `$${values.length}`; };
        let sql = '';
        if (op === 'insert' || op === 'upsert') {
          const entries = Object.entries(payload ?? {});
          sql = `insert into public.${identifier(table)} (${entries.map(([key]) => identifier(key)).join(',')}) values (${entries.map(([,v]) => bind(v)).join(',')})`;
          if (op === 'upsert') sql += ` on conflict (${conflict.split(',').map(identifier).join(',')}) do update set ${entries.map(([key]) => `${identifier(key)}=excluded.${identifier(key)}`).join(',')}`;
        } else {
          sql = op === 'update' ? `update public.${identifier(table)} set ${Object.entries(payload ?? {}).map(([key,v]) => `${identifier(key)}=${bind(v)}`).join(',')}` : `select * from public.${identifier(table)}`;
          const filters = clauses.map(c => { const text = c.sql(values.length); values.push(...c.values); return text; });
          if (filters.length) sql += ` where ${filters.join(' and ')}`;
          if (op === 'select' && limit !== null) sql += ` limit ${limit}`;
        }
        if (op !== 'select') sql += ' returning *';
        const queried = await pg.query(sql, values);
        return { data: queried.rows, error: null, count: queried.rows.length };
      };
      const q = {
        select: (..._args: unknown[]) => q,
        eq: (key: string, value: unknown) => { clauses.push({ sql: n => `${identifier(key)}=$${n + 1}`, values: [value] }); return q; },
        is: (key: string, value: unknown) => { if (value !== null) throw new Error('Unsupported test IS'); clauses.push({ sql: () => `${identifier(key)} is null`, values: [] }); return q; },
        in: (key: string, list: unknown[]) => { clauses.push({ sql: n => list.length ? `${identifier(key)} in (${list.map((_, i) => `$${n + i + 1}`).join(',')})` : 'false', values: list }); return q; },
        not: (key: string, operator: string, value: string) => {
          if (operator !== 'in') throw new Error('Unsupported test operator');
          const list = value.replace(/[()]/g, '').split(',');
          clauses.push({ sql: n => `${identifier(key)} not in (${list.map((_,i) => `$${n + i + 1}`).join(',')})`, values: list }); return q;
        },
        limit: (n: number) => { limit = n; return q; },
        insert: (value: Record<string, unknown>) => { op = 'insert'; payload = value; return q; },
        upsert: (value: Record<string, unknown>, opts: { onConflict: string }) => { op = 'upsert'; payload = value; conflict = opts.onConflict; return q; },
        update: (value: Record<string, unknown>) => { op = 'update'; payload = value; return q; },
        maybeSingle: async () => { const r = await result(); return { ...r, data: r.data[0] ?? null }; },
        single: async () => { const r = await result(); return { ...r, data: r.data[0] ?? null }; },
        then: (resolve: (r: any) => unknown, reject?: (e: unknown) => unknown) => result().then(resolve, reject),
      };
      return q;
    },
  };
}
