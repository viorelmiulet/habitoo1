import { Check, X } from "lucide-react";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";
import { mockPropertyMatches, mockRequest, mockRequestMatches } from "../mock-data";
import { ScoreRing } from "./ScoreRing";

function Card({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("mk-frame min-w-0 overflow-hidden", className)}>{children}</div>;
}

export function RequestMatchesMock({ className }: { className?: string }) {
  return (
    <Card className={className}>
      <div className="border-b border-border bg-muted/50 px-4 py-3">
        <p className="text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">
          Cerere → proprietăți potrivite
        </p>
        <p className="mt-1 truncate text-sm font-semibold">{mockRequest.title}</p>
        <p className="truncate text-[11px] text-muted-foreground">
          {mockRequest.contact} · {mockRequest.budget} · {mockRequest.rooms} · {mockRequest.areas}
        </p>
      </div>
      <ul className="divide-y divide-border">
        {mockRequestMatches.map((m) => (
          <li key={m.reference} className="flex items-center gap-3 px-4 py-3">
            <img
              src={m.photo}
              alt=""
              width={768}
              height={512}
              loading="lazy"
              className="size-12 shrink-0 rounded-lg object-cover"
            />
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <p className="truncate text-xs font-semibold">{m.title}</p>
                <span className="shrink-0 text-xs font-semibold text-navy">
                  {formatMoney(m.price)}
                </span>
              </div>
              <p className="text-[10px] text-muted-foreground">{m.reference}</p>
              <div className="mt-1.5 flex flex-wrap gap-1">
                {m.reasons.map((r) => (
                  <span
                    key={r}
                    className="inline-flex items-center gap-0.5 rounded bg-success/12 px-1.5 py-0.5 text-[9px] font-medium text-success"
                  >
                    <Check className="size-2.5" /> {r}
                  </span>
                ))}
                {m.misses.map((r) => (
                  <span
                    key={r}
                    className="inline-flex items-center gap-0.5 rounded bg-destructive/10 px-1.5 py-0.5 text-[9px] font-medium text-destructive"
                  >
                    <X className="size-2.5" /> {r}
                  </span>
                ))}
              </div>
            </div>
            <ScoreRing score={m.score} />
          </li>
        ))}
      </ul>
    </Card>
  );
}

export function PropertyMatchesMock({ className }: { className?: string }) {
  return (
    <Card className={className}>
      <div className="border-b border-border bg-muted/50 px-4 py-3">
        <p className="text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">
          Proprietate → clienți potriviți
        </p>
        <p className="mt-1 truncate text-sm font-semibold">
          Apartament 3 camere, Aviației · RF-1024
        </p>
        <p className="truncate text-[11px] text-muted-foreground">
          Vânzare · 158.000 € · 78 m² · etaj 4/8
        </p>
      </div>
      <ul className="divide-y divide-border">
        {mockPropertyMatches.map((m) => (
          <li key={m.name} className="flex items-center gap-3 px-4 py-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-navy text-[11px] font-semibold text-navy-foreground">
              {m.name
                .split(" ")
                .map((s) => s[0])
                .join("")}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-semibold">{m.name}</p>
              <p className="truncate text-[10px] text-muted-foreground">{m.request}</p>
              <div className="mt-1.5 flex flex-wrap gap-1">
                {m.reasons.map((r) => (
                  <span
                    key={r}
                    className="inline-flex items-center gap-0.5 rounded bg-success/12 px-1.5 py-0.5 text-[9px] font-medium text-success"
                  >
                    <Check className="size-2.5" /> {r}
                  </span>
                ))}
              </div>
            </div>
            <ScoreRing score={m.score} />
          </li>
        ))}
      </ul>
    </Card>
  );
}
