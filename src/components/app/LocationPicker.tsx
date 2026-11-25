// Selector oficial județ + localitate (nomenclator read-only).
// Se încarcă doar localitățile județului ales; filtrarea se face local, fără diacritice.
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, Loader2, MapPin, Search, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { prettyUatName, titleCaseRo } from "@/lib/ro-normalize";
import { filterSuggestions, toSuggestions, type LocalitySuggestion } from "@/lib/locality-suggestions";
import { cn } from "@/lib/utils";

export type LocationValue = {
  countySirutaCode: number | null;
  countyName: string;
  uatSirutaCode: number | null;
  localitySirutaCode: number | null;
  localityName: string;
};

export const emptyLocation: LocationValue = {
  countySirutaCode: null,
  countyName: "",
  uatSirutaCode: null,
  localitySirutaCode: null,
  localityName: "",
};

const LOCALITY_TYPE_LABELS: Record<string, string> = {
  sector: "sector",
  sat: "sat",
  localitate_componenta: "localitate",
};

export function useCounties() {
  return useQuery({
    queryKey: ["ro-counties"],
    staleTime: 60 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ro_counties")
        .select("siruta_code, name")
        .eq("active", true)
        .order("name");
      if (error) throw error;
      return (data ?? []).map((c) => ({
        sirutaCode: c.siruta_code,
        name: titleCaseRo(prettyUatName(c.name)),
      }));
    },
  });
}

type LocalityHit = LocalitySuggestion;
type County = { sirutaCode: number; name: string };

const foldRo = (t: string) => t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

/** Filtrare locală fără diacritice/majuscule; potrivirile de la începutul numelui primele. */
export function filterCounties(counties: County[], term: string): County[] {
  const q = foldRo(term);
  if (!q) return [];
  const starts: County[] = [];
  const contains: County[] = [];
  for (const c of counties) {
    const n = foldRo(c.name);
    if (n.startsWith(q)) starts.push(c);
    else if (n.includes(q)) contains.push(c);
  }
  return [...starts, ...contains];
}

function CountySearch({ idPrefix, required, counties, value, onSelect }: {
  idPrefix: string; required: boolean; counties: County[]; value: LocationValue; onSelect: (code: string) => void;
}) {
  const [term, setTerm] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const boxRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const results = useMemo(() => filterCounties(counties, term), [counties, term]);
  useEffect(() => { setActive(results.length > 0 ? 0 : -1); }, [results]);
  useEffect(() => {
    const onDoc = (e: MouseEvent) => { if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);
  const missing = required && !value.countySirutaCode;
  useEffect(() => { inputRef.current?.setCustomValidity(missing ? "Alege județul din listă." : ""); });
  const pick = (c: County) => { onSelect(String(c.sirutaCode)); setTerm(""); setOpen(false); setActive(-1); };
  const showList = open && term.trim().length > 0;

  if (value.countySirutaCode) {
    const name = value.countyName || counties.find((c) => c.sirutaCode === value.countySirutaCode)?.name || "";
    return (
      <div className="flex items-center justify-between gap-2 rounded-md border border-input bg-muted/40 px-3 py-2 text-sm">
        <span className="flex min-w-0 items-center gap-2">
          <MapPin className="size-4 shrink-0 text-muted-foreground" />
          <span className="truncate">{name}</span>
        </span>
        <Button type="button" variant="ghost" size="sm" onClick={() => onSelect("")} aria-label="Șterge județul">
          <X className="size-4" />
        </Button>
      </div>
    );
  }
  return (
    <div className="relative" ref={boxRef}>
      <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        ref={inputRef}
        id={`${idPrefix}-county`}
        className="pl-9"
        autoComplete="off"
        placeholder="Caută județul…"
        value={term}
        required={required}
        onChange={(e) => { setTerm(e.target.value); setOpen(true); }}
        onKeyDown={(e) => {
          if (e.key === "Escape") { setOpen(false); setActive(-1); return; }
          if (!showList || results.length === 0) return;
          if (e.key === "ArrowDown") { e.preventDefault(); setActive((i) => (i + 1) % results.length); }
          else if (e.key === "ArrowUp") { e.preventDefault(); setActive((i) => (i <= 0 ? results.length - 1 : i - 1)); }
          else if (e.key === "Enter" && active >= 0 && results[active]) { e.preventDefault(); pick(results[active]); }
        }}
        role="combobox"
        aria-expanded={showList && results.length > 0}
        aria-controls={`${idPrefix}-county-list`}
        aria-activedescendant={active >= 0 && results[active] ? `${idPrefix}-county-option-${results[active].sirutaCode}` : undefined}
      />
      {showList && (
        <div id={`${idPrefix}-county-list`} role="listbox" className="absolute z-(--z-floating) mt-1 max-h-[min(18rem,50vh)] w-full overflow-y-auto overscroll-contain rounded-md border bg-popover p-1 shadow-lg">
          {results.length > 0 ? results.map((c, index) => (
            <button key={c.sirutaCode} id={`${idPrefix}-county-option-${c.sirutaCode}`} type="button" role="option" aria-selected={index === active}
              onClick={() => pick(c)} onMouseEnter={() => setActive(index)}
              className={cn("flex w-full items-center rounded-sm px-2 py-2 text-left text-sm font-medium hover:bg-accent", index === active && "bg-accent")}>
              {c.name}
            </button>
          )) : <p className="px-2 py-3 text-sm text-muted-foreground">Niciun județ găsit.</p>}
        </div>
      )}
    </div>
  );
}

export function LocationPicker({
  value,
  onChange,
  idPrefix = "loc",
  required = false,
  onPostalCode,
  showDistrictHint = true,
}: {
  /** Codul poștal al localității alese (6 cifre) sau `null` la golire/schimbarea județului. */
  onPostalCode?: (code: string | null) => void;
  value: LocationValue;
  onChange: (next: LocationValue) => void;
  idPrefix?: string;
  required?: boolean;
  showDistrictHint?: boolean;
}) {
  const counties = useCounties();
  const [term, setTerm] = useState("");
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const boxRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  const localities = useQuery({
    queryKey: ["ro-localities-county", value.countySirutaCode],
    enabled: Boolean(value.countySirutaCode),
    staleTime: 30 * 60 * 1000,
    queryFn: async (): Promise<LocalityHit[]> => {
      const { data, error } = await supabase
        .from("ro_localities")
        .select("siruta_code, name, type, uat_siruta_code, postal_code, ro_uats!inner(name, type)")
        .eq("county_siruta_code", value.countySirutaCode!)
        .eq("active", true)
        .order("normalized_name")
        .limit(1000);
      if (error) throw error;
      return toSuggestions(
        (data ?? []).map((row) => {
          const raw = (row as unknown as { ro_uats: { name: string; type: string } | { name: string; type: string }[] }).ro_uats;
          const uat = Array.isArray(raw) ? raw[0] : raw;
          return {
            sirutaCode: row.siruta_code,
            rawName: row.name,
            type: row.type,
            uatSirutaCode: row.uat_siruta_code,
            uatName: uat?.name ?? "",
            uatType: uat?.type ?? null,
            postalCode: (row as unknown as { postal_code: string | null }).postal_code,
          };
        }),
      );
    },
  });

  const selectCounty = (code: string) => {
    const county = counties.data?.find((c) => String(c.sirutaCode) === code);
    setTerm("");
    if (!county || county.sirutaCode !== value.countySirutaCode) onPostalCode?.(null);
    onChange({
      countySirutaCode: county ? county.sirutaCode : null,
      countyName: county?.name ?? "",
      uatSirutaCode: null,
      localitySirutaCode: null,
      localityName: "",
    });
  };

  const results = useMemo(() => filterSuggestions(localities.data ?? [], term), [localities.data, term]);

  // Reset keyboard highlight whenever the result set changes.
  useEffect(() => {
    setActiveIndex(results.length > 0 ? 0 : -1);
  }, [results]); // eslint-disable-line react-hooks/exhaustive-deps

  // Keep the highlighted option visible inside the scrollable list.
  useEffect(() => {
    if (activeIndex < 0 || !listRef.current) return;
    listRef.current
      .querySelector(`[data-index="${activeIndex}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  const selectLocality = (hit: LocalityHit) => {
    onChange({
      ...value,
      uatSirutaCode: hit.uatSirutaCode,
      localitySirutaCode: hit.sirutaCode,
      localityName: hit.name,
    });
    onPostalCode?.(hit.postalCode);
    setTerm("");
    setOpen(false);
    setActiveIndex(-1);
  };

  const onSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") {
      setOpen(false);
      setActiveIndex(-1);
      return;
    }
    if (!open || results.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => (i + 1) % results.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => (i <= 0 ? results.length - 1 : i - 1));
    } else if (e.key === "Enter" && activeIndex >= 0) {
      e.preventDefault();
      selectLocality(results[activeIndex]);
    }
  };

  const clearLocality = () => {
    onChange({ ...value, uatSirutaCode: null, localitySirutaCode: null, localityName: "" });
    onPostalCode?.(null);
    setTerm("");
  };

  return (
    <>
      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}-county`}>
          Județ {required && <span className="text-destructive">*</span>}
        </Label>
        <CountySearch
          idPrefix={idPrefix}
          required={required}
          counties={counties.data ?? []}
          value={value}
          onSelect={(code) => selectCounty(code)}
        />
        {counties.isLoading && (
          <p className="text-xs text-muted-foreground">Se încarcă județele…</p>
        )}
      </div>

      <div className="space-y-2" ref={boxRef}>
        <Label htmlFor={`${idPrefix}-locality`}>
          Localitate {required && <span className="text-destructive">*</span>}
        </Label>

        {value.localitySirutaCode ? (
          <div className="flex items-center justify-between gap-2 rounded-md border border-input bg-muted/40 px-3 py-2 text-sm">
            <span className="flex min-w-0 items-center gap-2">
              <MapPin className="size-4 shrink-0 text-muted-foreground" />
              <span className="truncate">
                {value.localityName}
              </span>
            </span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={clearLocality}
              aria-label="Șterge localitatea"
            >
              <X className="size-4" />
            </Button>
          </div>
        ) : (
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id={`${idPrefix}-locality`}
              className="pl-9"
              autoComplete="off"
              disabled={!value.countySirutaCode}
              placeholder={
                value.countySirutaCode
                  ? "Alege sau caută localitatea…"
                  : "Alege mai întâi județul"
              }
              value={term}
              onChange={(e) => {
                setTerm(e.target.value);
                setOpen(true);
              }}
              onFocus={() => setOpen(true)}
              onClick={() => setOpen(true)}
              onKeyDown={onSearchKeyDown}
              role="combobox"
              aria-expanded={open && results.length > 0}
              aria-controls={`${idPrefix}-locality-list`}
              aria-activedescendant={
                activeIndex >= 0 && results[activeIndex]
                  ? `${idPrefix}-locality-option-${results[activeIndex].sirutaCode}`
                  : undefined
              }
            />
            {localities.isFetching && (
              <Loader2 className="absolute right-3 top-1/2 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />
            )}

            {open && value.countySirutaCode && (
              <div
                ref={listRef}
                id={`${idPrefix}-locality-list`}
                role="listbox"
                className="absolute z-(--z-floating) mt-1 max-h-[min(18rem,50vh)] w-full overflow-y-auto overscroll-contain rounded-md border bg-popover p-1 shadow-lg"
              >
                {results.length > 0 ? (
                  results.map((hit, index) => (
                    <button
                      key={hit.sirutaCode}
                      id={`${idPrefix}-locality-option-${hit.sirutaCode}`}
                      type="button"
                      role="option"
                      aria-selected={index === activeIndex}
                      data-index={index}
                      onClick={() => selectLocality(hit)}
                      onMouseEnter={() => setActiveIndex(index)}
                      className={cn(
                        "flex w-full items-start justify-between gap-2 rounded-sm px-2 py-2 text-left text-sm hover:bg-accent",
                        index === activeIndex && "bg-accent",
                      )}
                    >
                      <span className="min-w-0">
                        <span className="block truncate font-medium">{hit.name}</span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {LOCALITY_TYPE_LABELS[hit.type] ?? hit.type} · {hit.uatName} ·{" "}
                          {value.countyName}
                        </span>
                      </span>
                      <Check className="mt-0.5 size-4 shrink-0 opacity-0" />
                    </button>
                  ))
                ) : (
                  <p className="px-2 py-3 text-sm text-muted-foreground">
                    {localities.isFetching
                      ? "Se caută…"
                      : "Nicio localitate găsită în acest județ."}
                  </p>
                )}
              </div>
            )}
          </div>
        )}
        {showDistrictHint ? <p className="text-xs text-muted-foreground">
          Cartierele și ansamblurile (ex. Militari Residence) se trec în câmpul „Zonă / cartier”.
        </p> : null}
      </div>
    </>
  );
}
