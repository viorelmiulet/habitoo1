import {z} from 'zod';
export const WEBHOOK_EVENTS=['listing.upserted','listing.withdrawn','agency.activated','agency.deactivated','agent.updated'] as const;
export const webhookInput=z.object({url:z.string().url().max(2048),events:z.array(z.enum(WEBHOOK_EVENTS)).max(5).optional(),rotate_secret:z.boolean().optional()}).strict();
export const webhookDeliveryQuery=z.object({limit:z.coerce.number().int().min(1).max(100).default(20),cursor:z.string().regex(/^\d+$/).max(20).optional()}).strict();
export const RETRY_SECONDS=[60,300,1800,7200,21600,43200] as const;
export function retryDecision(createdAt:string,attempt:number,now=Date.now()){
 const deadline=Date.parse(createdAt)+86400000;
 return now>=deadline?{suspend:true,retryAt:null}:{suspend:false,retryAt:new Date(Math.min(deadline,now+RETRY_SECONDS[Math.min(Math.max(attempt-1,0),5)]*1000)).toISOString()};
}
export type WebhookConfig={url:string;events:string[];status:'active'|'suspended';has_secret:boolean;last_success_at:string|null;consecutive_failures:number};
export type WebhookDelivery={id:string;event:string;seq:number;http_status:number|null;duration_ms:number;attempt:number;occurred_at:string;error:string|null};
export type WebhookEvent={id:string;type:string;seq:number;occurred_at:string;data:{agency_id?:string;listing_id?:string;agent_id?:string}};
export function webhookEvent(event:{seq:number;type:string;entity_type:string;entity_id:string;organization_id:string;occurred_at:string}):WebhookEvent{
 return {id:`habitoo-${event.seq}`,type:event.type,seq:event.seq,occurred_at:event.occurred_at,data:{agency_id:event.organization_id,...(event.entity_type==='listing'?{listing_id:event.entity_id}:event.entity_type==='agent'?{agent_id:event.entity_id}:{})}};
}
