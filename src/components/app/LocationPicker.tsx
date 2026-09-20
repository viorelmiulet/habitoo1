// Selector oficial județ + localitate (nomenclator SIRUTA, read-only).
// Localitățile se caută server-side, cu limită, deci nu se încarcă niciodată tot nomenclatorul în browser.
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, Loader2, MapPin, Search, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { normalizeRoName, prettyUatName, titleCaseRo } from "@/lib/ro-normalize";
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

type LocalityHit = {
  sirutaCode: number;
  name: string;
  type: string;
  uatSirutaCode: number;
  uatName: string;
};

export function LocationPicker({
  value,
  onChange,
  idPrefix = "loc",
  required = false,
}: {
  value: LocationValue;
  onChange: (next: LocationValue) => void;
  idPrefix?: string;
  required?: boolean;
}) {
  const counties = useCounties();
  const [term, setTerm] = useState("");
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const boxRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const normalized = useMemo(() => normalizeRoName(term), [term]);

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  const localities = useQuery({
    queryKey: ["ro-localities", value.countySirutaCode, normalized],
    enabled: Boolean(value.countySirutaCode) && normalized.length >= 2,
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<LocalityHit[]> => {
      const { data, error } = await supabase
        .from("ro_localities")
        .select("siruta_code, name, type, uat_siruta_code, ro_uats!inner(name)")
        .eq("county_siruta_code", value.countySirutaCode!)
        .like("normalized_name", `${normalized}%`)
        .eq("active", true)
        .order("normalized_name")
        .limit(20);
      if (error) throw error;
      return (data ?? []).map((row) => {
        const uat = (row as unknown as { ro_uats: { name: string } | { name: string }[] }).ro_uats;
        const uatName = Array.isArray(uat) ? (uat[0]?.name ?? "") : (uat?.name ?? "");
        return {
          sirutaCode: row.siruta_code,
          name: titleCaseRo(row.name),
          type: row.type,
          uatSirutaCode: row.uat_siruta_code,
          uatName: titleCaseRo(prettyUatName(uatName)),
        };
      });
    },
  });

  const selectCounty = (code: string) => {
    const county = counties.data?.find((c) => String(c.sirutaCode) === code);
    setTerm("");
    onChange({
      countySirutaCode: county ? county.sirutaCode : null,
      countyName: county?.name ?? "",
      uatSirutaCode: null,
      localitySirutaCode: null,
      localityName: "",
    });
  };

  const results = localities.data ?? [];

  // Reset keyboard highlight whenever the result set changes.
  useEffect(() => {
    setActiveIndex(results.length > 0 ? 0 : -1);
  }, [localities.data]); // eslint-disable-line react-hooks/exhaustive-deps

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
    setTerm("");
  };

  return (
    <>
      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}-county`}>
          Județ {required && <span className="text-destructive">*</span>}
        </Label>
        <select
          id={`${idPrefix}-county`}
          className="h-11 w-full rounded-md border border-input bg-background px-3 text-sm"
          value={value.countySirutaCode ? String(value.countySirutaCode) : ""}
          onChange={(e) => selectCounty(e.target.value)}
          required={required}
        >
          <option value="">Alege județul…</option>
          {counties.data?.map((c) => (
            <option key={c.sirutaCode} value={String(c.sirutaCode)}>
              {c.name}
            </option>
          ))}
        </select>
        {counties.isLoading && (
          <p className="text-xs text-muted-foreground">Se încarcă nomenclatorul…</p>
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
                <span className="ml-1 text-xs text-muted-foreground">
                  SIRUTA {value.localitySirutaCode}
                </span>
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
                  ? "Caută localitatea (ex. chiajna)…"
                  : "Alege mai întâi județul"
              }
              value={term}
              onChange={(e) => {
                setTerm(e.target.value);
                setOpen(true);
              }}
              onFocus={() => setOpen(true)}
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

            {open && value.countySirutaCode && normalized.length >= 2 && (
              <div
                ref={listRef}
                id={`${idPrefix}-locality-list`}
                role="listbox"
                className="absolute z-(--z-floating) mt-1 max-h-72 w-full overflow-auto rounded-md border bg-popover p-1 shadow-lg"
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
        <p className="text-xs text-muted-foreground">
          Nomenclator oficial SIRUTA. Cartierele și ansamblurile (ex. Militari Residence) se trec în
          câmpul „Zonă / cartier”.
        </p>
      </div>
    </>
  );
}
