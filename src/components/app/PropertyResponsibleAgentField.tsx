import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export function PropertyResponsibleAgentField({ canEdit, value, name, candidates, onChange }: {
  canEdit: boolean; value: string; name: string | null | undefined;
  candidates: { id: string; full_name: string | null }[]; onChange: (value: string) => void;
}) {
  return <div className="space-y-2">
    <Label htmlFor="responsible-agent">Agent responsabil</Label>
    {canEdit ? <Select value={value || undefined} onValueChange={onChange}>
      <SelectTrigger id="responsible-agent" aria-label="Agent responsabil"><SelectValue placeholder={name || "Nealocat"}>
        {candidates.find(candidate => candidate.id === value)?.full_name || name || "Nealocat"}
      </SelectValue></SelectTrigger>
      <SelectContent>{candidates.map(candidate => <SelectItem key={candidate.id} value={candidate.id}>{candidate.full_name || "Utilizator"}</SelectItem>)}</SelectContent>
    </Select> : <p id="responsible-agent" className="text-sm">{name || "Nealocat"}</p>}
  </div>;
}