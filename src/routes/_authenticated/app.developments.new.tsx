import {createFileRoute} from '@tanstack/react-router';
import {DevelopmentForm} from '@/components/app/developments/DevelopmentForm';
import {developmentHead} from '@/lib/developments';
export const Route=createFileRoute('/_authenticated/app/developments/new')({head:()=>developmentHead('Adaugă ansamblu','Creează un ansamblu rezidențial în portofoliul agenției.'),component:NewDevelopment});
function NewDevelopment(){return <DevelopmentForm/>;}
