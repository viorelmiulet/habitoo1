import { createFileRoute } from '@tanstack/react-router';
import { withFeedAuth } from '@/lib/site-feed/auth.server';
import { handleDevelopmentsList } from '@/lib/site-feed/developments.server';
export const Route = createFileRoute('/api/public/sites/v1/developments')({server:{handlers:{
  GET:({request})=>withFeedAuth(request,'developments',auth=>handleDevelopmentsList(request,auth),{inventory:true}),
}}});