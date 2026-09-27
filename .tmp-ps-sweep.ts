const { sweepMissingPostalCodes } = await import("./src/lib/geo/postal-code.ports.server.ts");
const r = await sweepMissingPostalCodes({ limit: 60 });
const by: Record<string, number> = {};
for (const x of r) { const k = `${x.status}/${x.source ?? "-"}/${x.reason}`; by[k] = (by[k] ?? 0) + 1; }
console.log(r.length, JSON.stringify(by));
process.exit(0);
