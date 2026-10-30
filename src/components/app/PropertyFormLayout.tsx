/**
 * Așezarea comună a formularelor de proprietate (editare și proprietate nouă):
 * coloană stânga, caracteristici + dotări, apoi „Descriere și Titlu” și restul panourilor.
 * Prezentare doar; valorile și salvarea rămân la pagina părinte.
 */
import type { ReactNode } from "react";
import { Input } from "@/components/ui/input";
import { FormRow, FormSection, RequiredMark } from "@/components/app/FormSection";
import { PropertyDescriptionTextarea } from "@/components/app/PropertyDescriptionTextarea";

export const TITLE_COUNTER_MAX = 70;
export const DESCRIPTION_COUNTER_MAX = 3000;

export function PropertyFormLayout({ aside, details, children }: { aside?: ReactNode; details: ReactNode; children: ReactNode }) {
  return (
    <div className="grid min-w-0 items-start gap-4 lg:grid-cols-[260px_minmax(0,1fr)]">
      {aside ? <aside className="min-w-0 space-y-4 lg:sticky lg:top-[7.5rem] lg:max-h-[calc(100vh-8.5rem)] lg:overflow-y-auto">{aside}</aside> : null}
      <div className={aside ? "min-w-0 space-y-4" : "min-w-0 space-y-4 lg:col-span-2"}>
        {details}
        {children}
      </div>
    </div>
  );
}

export function PropertyTitleDescriptionPanel({ title, description, onTitle, onDescription, titleRequired, titlePlaceholder, stacked = false }: {
  title: string; description: string; onTitle: (v: string) => void; onDescription: (v: string) => void;
  titleRequired?: boolean; titlePlaceholder?: string;
  stacked?: boolean;
}) {
  return (
    <FormSection title="Descriere și Titlu">
      {stacked ? <div className="min-w-0 space-y-2">
        <label htmlFor="title" className="text-[15px]">Titlu anunț<RequiredMark /> <span className="text-muted-foreground">({title.length}/{TITLE_COUNTER_MAX})</span></label>
        <Input id="title" required={titleRequired} className="h-9 text-[15px]" value={title} placeholder={titlePlaceholder} onChange={(e) => onTitle(e.target.value)} />
      </div> : <FormRow htmlFor="title" label={<>Titlu anunț<RequiredMark /> <span className="text-muted-foreground">({title.length}/{TITLE_COUNTER_MAX})</span></>}>
        <Input id="title" required={titleRequired} className="h-9 text-[15px]" value={title} placeholder={titlePlaceholder} onChange={(e) => onTitle(e.target.value)} />
      </FormRow>}
      <div className={stacked ? "grid min-w-0 grid-cols-1 gap-2" : "grid min-w-0 grid-cols-1 gap-x-3 gap-y-1 sm:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]"}>
        <label htmlFor="description" className={stacked ? "text-[15px]" : "pt-2 text-[15px] sm:text-right"}>Descriere <span className="text-muted-foreground">({description.length}/{DESCRIPTION_COUNTER_MAX})</span></label>
        <PropertyDescriptionTextarea id="description" rows={stacked ? 12 : undefined} className={stacked ? "min-h-[300px] text-[15px] leading-6 sm:min-h-[300px]" : "text-[15px]"} value={description} onChange={(e) => onDescription(e.target.value)} />
      </div>
    </FormSection>
  );
}
