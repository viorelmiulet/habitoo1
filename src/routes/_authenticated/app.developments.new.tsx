import {createFileRoute} from '@tanstack/react-router';
import {DevelopmentForm} from '@/components/app/developments/DevelopmentForm';
import {developmentHead} from '@/lib/developments';
import {useCanCreateDevelopment} from '@/components/app/developments/DevelopmentPermissions';
import {DEVELOPMENT_CREATE_NOT_ALLOWED} from '@/lib/developments/portal-selections';
export const Route=createFileRoute('/_authenticated/app/developments/new')({head:()=>developmentHead('Adaugă ansamblu','Creează un ansamblu rezidențial în portofoliul agenției.'),component:NewDevelopment});
function NewDevelopment(){const can=useCanCreateDevelopment();if(can===null)return null;if(!can)return <div className="panel p-6 text-sm text-muted-foreground" role="alert">{DEVELOPMENT_CREATE_NOT_ALLOWED}</div>;return <DevelopmentForm/>;}
