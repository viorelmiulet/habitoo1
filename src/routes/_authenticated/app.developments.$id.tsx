import {createFileRoute} from '@tanstack/react-router';
import {useSuspenseQuery} from '@tanstack/react-query';
import {DevelopmentForm} from '@/components/app/developments/DevelopmentForm';
import {developmentHead,developmentOptions} from '@/lib/developments';
export const Route=createFileRoute('/_authenticated/app/developments/$id')({head:()=>developmentHead('Fișa ansamblului','Date, fotografii și unități ale ansamblului rezidențial.'),loader:({context,params})=>context.queryClient.ensureQueryData(developmentOptions(params.id)),component:DevelopmentDetail});
function DevelopmentDetail(){const {id}=Route.useParams();const {data}=useSuspenseQuery(developmentOptions(id));return <DevelopmentForm key={data.id+data.updated_at} development={data}/>;}
