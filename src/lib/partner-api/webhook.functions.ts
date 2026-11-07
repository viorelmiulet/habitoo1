import {createServerFn} from '@tanstack/react-start';
import {requireSupabaseAuth} from '@/integrations/supabase/auth-middleware';
import {z} from 'zod';
const input=z.object({portal:z.string().regex(/^[a-z][a-z0-9-]{1,39}$/),environment:z.enum(['test','live'])});
export const partnerWebhookOverview=createServerFn({method:'GET'}).middleware([requireSupabaseAuth]).inputValidator(input).handler(async({data,context})=>{
 const access=await context.supabase.rpc('is_superadmin');if(access.error||access.data!==true)throw new Error('Acces refuzat.');
 const {webhookStore,publicWebhook}=await import('./webhook.server');const store=await webhookStore();
 return {webhook:publicWebhook(await store.get(data.portal,data.environment)),deliveries:await store.deliveries(data.portal,data.environment,5)};
});
export const partnerWebhookAdminAction=createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).inputValidator(input.extend({action:z.enum(['test','reactivate'])})).handler(async({data,context})=>{
 const access=await context.supabase.rpc('is_superadmin');if(access.error||access.data!==true)throw new Error('Acces refuzat.');
 const {webhookStore,runWebhookWorker}=await import('./webhook.server');const store=await webhookStore(),config=await store.get(data.portal,data.environment);
 if(!config)throw new Error('Webhook inexistent.');
 if(data.action==='reactivate'){const {validateWebhookUrl}=await import('./webhook-security.server');await validateWebhookUrl(config.url);await store.put(data.portal,data.environment,config.url,config.events,null);return {reactivated:true};}
 const id=await store.test(data.portal,data.environment);if(!id)throw new Error('Webhook suspendat. Reactivează înainte de test.');
 await runWebhookWorker(store,fetch,data.portal,data.environment);await store.wake();return {id};
});
