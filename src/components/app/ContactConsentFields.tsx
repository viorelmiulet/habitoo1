import { useState } from 'react';
import { CONTACT_SOURCES, CONSENT_METHODS, type ContactConsentFields as Fields } from '@/lib/contact-consent';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

export function ContactConsentFields({ value, onChange }: { value: Fields; onChange: (patch: Partial<Fields>) => void }) {
  const [other, setOther] = useState(Boolean(value.source && !CONTACT_SOURCES.some(s => s === value.source)));
  return <div className="space-y-4">
    <div data-tour="contact-create-source" className="space-y-2">
      <Label htmlFor="contact-source">Sursă</Label>
      <Select value={other ? 'other' : value.source || 'none'} onValueChange={s => { setOther(s === 'other'); onChange({ source: s === 'other' || s === 'none' ? '' : s }); }}>
        <SelectTrigger id="contact-source"><SelectValue placeholder="Alege sursa" /></SelectTrigger>
        <SelectContent><SelectItem value="none">Nespecificată</SelectItem>{CONTACT_SOURCES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}<SelectItem value="other">Altă sursă</SelectItem></SelectContent>
      </Select>
      {other && <><Label htmlFor="contact-source-other">Altă sursă</Label><Input id="contact-source-other" required maxLength={200} value={value.source} onChange={e => onChange({ source: e.target.value })} /></>}
    </div>
    <div data-tour="contact-create-consent" className="space-y-3">
      <div className="flex items-start gap-2"><Checkbox id="contact-consent" checked={value.gdpr_consent} onCheckedChange={v => onChange({ gdpr_consent: v === true })} /><Label htmlFor="contact-consent" className="leading-5">Clientul și-a dat acordul pentru prelucrarea datelor și pentru a primi oferte</Label></div>
      {value.gdpr_consent && <div className="space-y-2"><Label htmlFor="contact-consent-method">Modul acordului</Label><Select value={value.gdpr_consent_method} onValueChange={s => onChange({ gdpr_consent_method: s })}><SelectTrigger id="contact-consent-method"><SelectValue placeholder="Alege modul" /></SelectTrigger><SelectContent>{CONSENT_METHODS.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent></Select></div>}
    </div>
  </div>;
}