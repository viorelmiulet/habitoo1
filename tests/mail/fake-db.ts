// Minimal supabase-js lookalike for the Mail Center server helpers.
// Records the builder chain and answers with whatever the handler returns.
export type FakeOp = { method: string; args: unknown[] };
export type FakeResult = { data?: unknown; error?: unknown; count?: number };
export type FakeHandler = (table: string, ops: FakeOp[]) => FakeResult;

export type FakeDb = {
  from: (table: string) => any;
  rpc: (name: string, args: unknown) => Promise<FakeResult>;
  storage: { from: (bucket: string) => any };
  calls: { table: string; ops: FakeOp[] }[];
  rpcCalls: { name: string; args: unknown }[];
  uploads: { path: string; bytes: unknown }[];
  moves: { from: string; to: string }[];
  removals: string[][];
};

export function makeFakeDb(options: {
  handler: FakeHandler;
  rpc?: (name: string, args: unknown) => FakeResult;
  upload?: () => { error: unknown | null };
  download?: (path: string) => { data: unknown; error: unknown | null };
  move?: (from: string, to: string) => { error: unknown | null };
}): FakeDb {
  const calls: { table: string; ops: FakeOp[] }[] = [];
  const rpcCalls: { name: string; args: unknown }[] = [];
  const uploads: { path: string; bytes: unknown }[] = [];
  const moves: { from: string; to: string }[] = [];
  const removals: string[][] = [];

  const from = (table: string) => {
    const ops: FakeOp[] = [];
    calls.push({ table, ops });
    const proxy: any = new Proxy(
      {},
      {
        get(_t, prop: string) {
          if (prop === "then") {
            return (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
              Promise.resolve(options.handler(table, ops)).then(resolve, reject);
          }
          return (...args: unknown[]) => {
            ops.push({ method: prop, args });
            if (prop === "single" || prop === "maybeSingle") {
              return Promise.resolve(options.handler(table, ops));
            }
            return proxy;
          };
        },
      },
    );
    return proxy;
  };

  return {
    from,
    calls,
    rpcCalls,
    uploads,
    moves,
    removals,
    rpc: async (name: string, args: unknown) => {
      rpcCalls.push({ name, args });
      if (options.rpc) return options.rpc(name, args);
      // Threading is resolved through this RPC on every send; the default
      // answer keeps unrelated tests focused on what they assert.
      if (name === "email_thread_upsert") return { data: "thread-default", error: null };
      return { data: null, error: null };
    },
    storage: {
      from: () => ({
        upload: async (path: string, bytes: unknown) => {
          uploads.push({ path, bytes });
          return options.upload ? options.upload() : { error: null };
        },
        download: async (path: string) =>
          options.download
            ? options.download(path)
            : { data: { arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer }, error: null },
        move: async (from: string, to: string) => {
          moves.push({ from, to });
          return options.move ? options.move(from, to) : { error: null };
        },
        remove: async (paths: string[]) => {
          removals.push(paths);
          return { data: null, error: null };
        },
        createSignedUrl: async (path: string) => ({
          data: { signedUrl: `https://signed.test/${path}` },
          error: null,
        }),
      }),
    },
  };
}

/** True when the recorded chain contains `method(...args)`. */
export function hasOp(ops: FakeOp[], method: string, ...args: unknown[]): boolean {
  return ops.some(
    (op) =>
      op.method === method &&
      args.every((a, i) => JSON.stringify(op.args[i]) === JSON.stringify(a)),
  );
}
