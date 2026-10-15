import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { buildPresentationHtml, type MaterialBranding, type PresentationData } from "@/lib/materials";
import { PROPERTY_SHEET_TEMPLATES, type PropertySheetTemplate } from "@/lib/property-sheet-templates";

function thumbnailHtml(branding: MaterialBranding, data: PresentationData, template: PropertySheetTemplate) {
  return buildPresentationHtml(branding, data, template).replace("</head>", `<style>html,body{overflow:hidden;background:transparent}.page{margin:0;box-shadow:none}.page~.page{display:none}h1,.price{overflow-wrap:anywhere;white-space:normal}</style></head>`)
    .replace("</body>", `<script>function fit(){document.body.style.zoom=innerWidth/(210*96/25.4);const t=document.querySelector('.property-heading h1');if(t){let s=parseFloat(getComputedStyle(t).fontSize);while(t.offsetHeight>90&&s>9){t.style.fontSize=(--s)+'px'}}}addEventListener('resize',fit);addEventListener('load',fit);fit();</script></body>`);
}

export function PropertySheetTemplatePicker({ branding, data, value, onChange, disabled = false }: {
  branding: MaterialBranding; data: PresentationData; value: PropertySheetTemplate;
  onChange: (value: PropertySheetTemplate) => void; disabled?: boolean;
}) {
  const previews = useMemo(() => PROPERTY_SHEET_TEMPLATES.map(item => ({ ...item, html: thumbnailHtml(branding, data, item.id) })), [branding, data]);
  return <div className="grid grid-cols-2 gap-3 sm:grid-cols-3" role="group" aria-label="Model fișă de proprietate">
    {previews.map(item => <Button key={item.id} type="button" variant="outline" disabled={disabled}
      aria-pressed={value === item.id} aria-label={`Model ${item.name}`} onClick={() => onChange(item.id)}
      className={`h-auto min-w-0 flex-col gap-2 p-2 ${value === item.id ? "border-primary ring-2 ring-primary/30" : ""}`}>
      <span className="sheet-thumbnail block w-full overflow-hidden rounded-sm border border-border">
        <iframe title={`Previzualizare ${item.name}`} srcDoc={item.html} sandbox="allow-scripts" tabIndex={-1} loading="lazy" className="pointer-events-none block size-full border-0" />
      </span><span className="text-sm font-medium">{item.name}</span>
    </Button>)}
  </div>;
}