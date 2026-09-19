/**
 * Properstar: portal care CITEȘTE ofertele dintr-un feed XML. Aici agenția vede
 * ce intră în feed, ce lipsește la ofertele excluse și linkul pe care îl dă
 * Properstar. Nicio publicare, nicio retragere de aici.
 */
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { InlineLoading } from "@/components/app/LoadingState";
import { PortalLogo } from "@/components/app/PortalLogo";
import { QueryError } from "@/components/app/QueryError";
import { getProperstarFeedReport } from "@/lib/portals/properstar.functions";

export function ProperstarFeedCard() {
  const load = useServerFn(getProperstarFeedReport);
  const report = useQuery({
    queryKey: ["properstar-feed-report"],
    queryFn: () => load({}),
  });

  return (
    <section className="panel">
      <header className="border-b border-border px-5 py-4">
        <div className="flex items-start gap-3">
          <PortalLogo portalId="properstar" name="Properstar" size={40} />
          <div className="min-w-0">
            <h2 className="text-sm font-semibold tracking-wide uppercase">Feed Properstar</h2>
            <p className="text-xs text-muted-foreground">
              Properstar preia singur ofertele bifate pentru el, din linkul de mai jos. Ofertele
              debifate sau vândute rămân 7 zile în feed, marcate ca retrase, ca să dispară și la ei.
            </p>
          </div>
        </div>
      </header>

      <div className="space-y-4 px-5 py-4">
        {report.isLoading ? <InlineLoading /> : null}
        {report.error ? <QueryError error={report.error as Error} /> : null}
        {report.data ? (
          <>
            <div className="grid gap-3 sm:grid-cols-3">
              <Stat label="Oferte bifate" value={report.data.selected} />
              <Stat label="Trimise acum" value={report.data.active} />
              <Stat label="Marcate retrase" value={report.data.deleted} />
            </div>

            <div className="space-y-1">
              <p className="text-xs font-medium">Linkul pentru Properstar</p>
              <code className="block overflow-x-auto rounded border border-border bg-muted/40 px-3 py-2 text-xs">
                {report.data.feedUrlTemplate}
              </code>
              <p className="text-xs text-muted-foreground">
                {report.data.hasActiveKey
                  ? "Cheia agenției este activă. Linkul de mai sus arată doar începutul cheii; partea secretă se afișează o singură dată, la generarea cheii. Dacă nu o mai ai, cere echipei Habitoo una nouă."
                  : "Cheia de acces se generează de echipa Habitoo și se afișează o singură dată, la generare; fără ea linkul nu răspunde."}
              </p>
              {report.data.lastFetchAt ? (
                <p className="text-xs text-muted-foreground">
                  Ultima preluare: {new Date(report.data.lastFetchAt).toLocaleString("ro-RO")}
                  {report.data.lastFetchItems !== null
                    ? ` — ${report.data.lastFetchItems} oferte`
                    : ""}
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">Properstar nu a preluat feedul încă.</p>
              )}
            </div>

            <div className="space-y-2">
              <p className="text-xs font-medium">De completat pentru Properstar</p>
              {report.data.excluded.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  Toate ofertele bifate au datele necesare.
                </p>
              ) : (
                <ul className="space-y-2">
                  {report.data.excluded.map((item) => (
                    <li
                      key={item.propertyId}
                      className="rounded border border-border px-3 py-2 text-xs"
                    >
                      <span className="font-medium">
                        {item.title ?? item.reference ?? "Ofertă fără titlu"}
                      </span>
                      {item.reference ? (
                        <span className="text-muted-foreground"> · {item.reference}</span>
                      ) : null}
                      <p className="mt-1 text-muted-foreground">
                        Lipsește: {item.missing.join(", ")}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </>
        ) : null}
      </div>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded border border-border px-3 py-2">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-lg font-semibold">{value}</p>
    </div>
  );
}
