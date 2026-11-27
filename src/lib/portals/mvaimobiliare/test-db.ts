/** In-memory query double; no network, secrets or production database. */
export type Row = Record<string, any>;
export function fakeMvaDb(rows: Record<string, Row[]> = {}) {
  const db = {
    rows,
    rpc: async (_name: string, _args?: any): Promise<any> => ({ data: null, error: null }),
    from(table: string) {
      const filters: ((r: Row) => boolean)[] = [];
      let range: [number, number] | null = null;
      let patch: Row | null = null;
      const result = () => {
        let data = (rows[table] ?? []).filter(r => filters.every(f => f(r)));
        if (patch) for (const r of data) Object.assign(r, patch);
        const count = data.length;
        if (range) data = data.slice(range[0], range[1] + 1);
        return { data, count, error: null };
      };
      const q = {
        select: (..._args: any[]) => q, order: (..._args: any[]) => q, limit: (_n: number) => q,
        eq: (c: string, v: unknown) => { filters.push(r => r[c] === v); return q; },
        is: (c: string, v: unknown) => { filters.push(r => (r[c] ?? null) === v); return q; },
        in: (c: string, vs: unknown[]) => { filters.push(r => vs.includes(r[c])); return q; },
        range: (a: number, b: number) => { range = [a, b]; return q; },
        update: (p: Row) => { patch = p; return q; },
        insert: async (row: Row) => { (rows[table] ??= []).push(row); return { error: null }; },
        upsert: async (row: Row) => {
          const key = table === 'portal_publications' ? 'portal_key' : 'portal';
          const existing = (rows[table] ?? []).find(r => r['organization_id'] === row['organization_id'] && r['property_id'] === row['property_id'] && r[key] === row[key]);
          if (existing) Object.assign(existing, row); else (rows[table] ??= []).push(row);
          return { error: null };
        },
        maybeSingle: async () => ({ ...result(), data: result().data[0] ?? null }),
        single: async () => ({ ...result(), data: result().data[0] ?? null }),
        then: (resolve: (r: any) => any) => Promise.resolve(result()).then(resolve),
      };
      return q;
    },
  };
  return db;
}
