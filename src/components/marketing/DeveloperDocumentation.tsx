import { useEffect, useState } from 'react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { DeveloperDocs } from './DeveloperDocs';
import { PartnerDeveloperDocs } from './PartnerDeveloperDocs';

export function DeveloperDocumentation() {
  const [tab,setTab]=useState('partner');
  useEffect(()=>{if(window.location.hash && !window.location.hash.startsWith('#partner-'))setTab('feed');},[]);
  return <Tabs value={tab} onValueChange={setTab} className="min-w-0 pt-6"><div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8"><TabsList className="grid h-auto w-full grid-cols-2 lg:w-auto lg:inline-grid"><TabsTrigger value="partner" className="min-h-11 whitespace-normal text-center">Partner API (recommandé){/* translated below */}</TabsTrigger><TabsTrigger value="feed" className="min-h-11 whitespace-normal text-center">Feed (alternativă simplă)</TabsTrigger></TabsList></div><TabsContent value="partner"><PartnerDeveloperDocs /></TabsContent><TabsContent value="feed"><DeveloperDocs /></TabsContent></Tabs>;
}