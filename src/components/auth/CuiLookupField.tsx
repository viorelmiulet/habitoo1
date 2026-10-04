import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, Building2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { lookupCompanyByCui } from "@/lib/company-lookup.functions";
import {
  COMPANY_STATUS_LABEL,
  DUPLICATE_CUI_MESSAGE,
  LOOKUP_MESSAGES,
  type CompanyInfo,
  type LookupResult,
} from "@/lib/company-lookup";

export type CuiLookupState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "found"; company: CompanyInfo }
  | { kind: "duplicate" }
  | { kind: "error"; reason: string; message: string };

type Props = {
  value: string;
  onChange: (v: string) => void;
  onState: (s: CuiLookupState) => void;
  /** Pentru teste. */
  lookup?: (cui: string) => Promise<LookupResult>;
};

/** CUI + căutare automată în ANAF; folosit la /register și /onboarding. */
export function CuiLookupField({ value, onChange, onState, lookup }: Props) {
  const serverLookup = useServerFn(lookupCompanyByCui);
  const run = lookup ?? ((cui: string) => serverLookup({ data: { cui } }));
  const [state, setStateRaw] = useState<CuiLookupState>({ kind: "idle" });
  const last = useRef("");
  const setState = (s: CuiLookupState) => {
    setStateRaw(s);
    onState(s);
  };

  const search = async (raw: string) => {
    last.current = raw;
    setState({ kind: "loading" });
    let r: LookupResult;
    try {
      r = await run(raw);
    } catch {
      r = { ok: false, reason: "unavailable", message: LOOKUP_MESSAGES.unavailable };
    }
    if (last.current !== raw) return;
    if (r.ok) setState(r.alreadyRegistered ? { kind: "duplicate" } : { kind: "found", company: r.company });
    else setState({ kind: "error", reason: r.reason, message: r.message });
  };

  useEffect(() => {
    const digits = value.replace(/\D/g, "");
    if (digits.length < 6) return;
    const t = setTimeout(() => void search(value), 600);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return (
    <div className="space-y-2">
      <Label htmlFor="cui">CUI-ul firmei</Label>
      <div className="flex gap-2">
        <Input
          id="cui"
          required
          inputMode="numeric"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="ex. RO12345678"
        />
        <Button type="button" variant="outline" onClick={() => void search(value)} disabled={state.kind === "loading"}>
          {state.kind === "loading" ? <Loader2 className="size-4 animate-spin" /> : "Caută firma"}
        </Button>
      </div>
      {state.kind === "found" ? (
        <div data-testid="company-card" className="rounded-lg border border-border bg-muted/40 p-3 text-sm">
          <p className="flex items-center gap-2 font-medium">
            <Building2 className="size-4 shrink-0 text-primary" />
            <span className="min-w-0 break-words">{state.company.legalName}</span>
          </p>
          {state.company.address ? (
            <p className="mt-1 break-words text-xs text-muted-foreground">{state.company.address}</p>
          ) : null}
          <p className="mt-1 text-xs text-muted-foreground">
            Stare: {COMPANY_STATUS_LABEL[state.company.status]}
          </p>
          {state.company.status !== "activa" ? (
            <p role="alert" className="mt-2 flex gap-2 text-xs text-destructive">
              <AlertTriangle className="size-4 shrink-0" />
              Firma apare ca {COMPANY_STATUS_LABEL[state.company.status].toLowerCase()} la ANAF. Poți continua
              înregistrarea; echipa Habitoo va verifica datele.
            </p>
          ) : null}
        </div>
      ) : state.kind === "duplicate" ? (
        <p role="alert" className="text-xs text-destructive">
          {DUPLICATE_CUI_MESSAGE}
        </p>
      ) : state.kind === "error" ? (
        <p role="status" className="text-xs text-muted-foreground">
          {state.message}
        </p>
      ) : (
        <p className="text-xs text-muted-foreground">Preluăm automat datele firmei din registrul public ANAF.</p>
      )}
    </div>
  );
}
