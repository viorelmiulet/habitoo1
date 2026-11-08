import { useEffect, useState } from 'react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { DeveloperDocs } from './DeveloperDocs';
import { PartnerDeveloperDocs } from './PartnerDeveloperDocs';
import { Button } from '@/components/ui/button';
import { Building2, Globe, ArrowRight } from 'lucide-react';

export function DeveloperDocumentation() {
  const [tab,setTab]=useState('partner');
  const [showAgencyGuide, setShowAgencyGuide] = useState(false);
  useEffect(()=>{if(window.location.hash && !window.location.hash.startsWith('#partner-'))setTab('feed');},[]);
  useEffect(() => {
    if (tab !== 'feed' || !showAgencyGuide) return;
    document.getElementById('site-agentie')?.scrollIntoView({behavior: 'instant', block: 'start'});
    setShowAgencyGuide(false);
  }, [tab, showAgencyGuide]);
  return <div className="min-w-0 pt-6">
    <section aria-labelledby="integration-choice" className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
      <h2 id="integration-choice" className="mb-4 text-2xl font-bold text-navy">Ce integrezi?</h2>
      <div className="grid gap-4 md:grid-cols-2">
        <article className="min-w-0 rounded-lg border border-border bg-card p-5">
          <Building2 className="mb-3 size-6 text-gold-dark" aria-hidden="true" />
          <h3 className="text-lg font-bold text-navy">Ești portal imobiliar?</h3>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">Alege Partner API (recomandat) sau Feed. Cheia se cere la <a href="mailto:contact@habitoo.ro" className="font-semibold text-navy underline">contact@habitoo.ro</a>.</p>
          <div className="mt-4 flex flex-wrap gap-2"><Button variant="outline" onClick={() => setTab('partner')}>Partner API <ArrowRight /></Button><Button variant="ghost" onClick={() => setTab('feed')}>Feed <ArrowRight /></Button></div>
        </article>
        <article className="min-w-0 rounded-lg border border-border bg-card p-5">
          <Globe className="mb-3 size-6 text-gold-dark" aria-hidden="true" />
          <h3 className="text-lg font-bold text-navy">Ești agenție Habitoo și ai propriul site?</h3>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">Folosește feedul pentru site-ul agenției. Administratorul agenției generează tokenul în Habitoo → Setări → Integrări → „Feed pentru site-ul agenției”. Fără cereri la suport.</p>
          <Button variant="outline" className="mt-4" onClick={() => { setTab('feed'); setShowAgencyGuide(true); history.replaceState(null, '', '#site-agentie'); }}>Site-ul propriu al agenției <ArrowRight /></Button>
        </article>
      </div>
    </section>
    <Tabs value={tab} onValueChange={setTab} className="mt-6 min-w-0"><div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8"><TabsList className="grid h-auto w-full grid-cols-2 lg:w-auto lg:inline-grid"><TabsTrigger value="partner" className="min-h-11 whitespace-normal text-center">Partner API (recomandat)</TabsTrigger><TabsTrigger value="feed" className="min-h-11 whitespace-normal text-center">Feed (alternativă simplă)</TabsTrigger></TabsList></div><TabsContent value="partner"><PartnerDeveloperDocs /></TabsContent><TabsContent value="feed"><DeveloperDocs /></TabsContent></Tabs>
  </div>;
}