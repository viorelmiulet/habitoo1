import { createFileRoute } from '@tanstack/react-router';
import { withFeedAuth } from '@/lib/site-feed/auth.server';
import { handleDevelopmentDetail } from '@/lib/site-feed/developments.server';
export const Route = createFileRoute('/api/public/portal/v1/developments/$id')({server:{handlers:{
  GET:({request,params})=>withFeedAuth(request,'portal.developments.detail',auth=>handleDevelopmentDetail(request,auth,params.id),{inventory:true}),
}}});