CREATE TABLE public.offer_client_deliveries (
 id uuid PRIMARY KEY, organization_id uuid NOT NULL REFERENCES public.organizations(id), agent_id uuid NOT NULL REFERENCES public.profiles(id), property_id uuid NOT NULL REFERENCES public.properties(id), contact_id uuid REFERENCES public.contacts(id), lead_id uuid REFERENCES public.leads(id), channel text NOT NULL CHECK(channel IN ('whatsapp','email','sms','copy')), recipient text, status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','sent','failed','logged')), created_at timestamptz NOT NULL DEFAULT now(), sent_at timestamptz, activity_id uuid REFERENCES public.activities(id)
);
GRANT SELECT,INSERT,UPDATE ON public.offer_client_deliveries TO authenticated;
GRANT ALL ON public.offer_client_deliveries TO service_role;
ALTER TABLE public.offer_client_deliveries ENABLE ROW LEVEL SECURITY;
CREATE POLICY offer_client_deliveries_self ON public.offer_client_deliveries TO authenticated USING(agent_id=auth.uid() AND organization_id=public.current_org()) WITH CHECK(agent_id=auth.uid() AND organization_id=public.current_org());
CREATE OR REPLACE FUNCTION public.finish_offer_client_delivery(_id uuid) RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE d public.offer_client_deliveries; a uuid; agent_name text;
BEGIN
 SELECT * INTO d FROM public.offer_client_deliveries WHERE id=_id AND agent_id=auth.uid() FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Trimitere indisponibilă'; END IF;
 IF d.activity_id IS NOT NULL THEN RETURN d.activity_id; END IF;
 IF d.status <> 'sent' THEN RAISE EXCEPTION 'Trimiterea nu este confirmată'; END IF;
 SELECT full_name INTO agent_name FROM public.profiles WHERE id=auth.uid();
 INSERT INTO public.activities(organization_id,kind,title,description,starts_at,ends_at,done,status,duration_minutes,contact_id,property_id,lead_id,assigned_to,created_by)
 VALUES(d.organization_id, CASE WHEN d.channel='email' THEN 'email'::public.activity_kind ELSE 'note'::public.activity_kind END,'Ofertă trimisă',concat('Canal: ',CASE d.channel WHEN 'whatsapp' THEN 'WhatsApp' WHEN 'email' THEN 'Email' WHEN 'sms' THEN 'SMS' ELSE 'Link copiat' END,' · Agent: ',coalesce(agent_name,'Agent'),' · ',CASE WHEN d.channel IN ('whatsapp','sms') THEN 'Trimitere confirmată de agent' WHEN d.channel='copy' THEN 'Link copiat; livrarea nu este confirmată' ELSE 'Email acceptat de serviciul de trimitere' END),coalesce(d.sent_at,now()),coalesce(d.sent_at,now()),true,'done',0,d.contact_id,d.property_id,d.lead_id,auth.uid(),auth.uid()) RETURNING id INTO a;
 INSERT INTO public.audit_logs(organization_id,actor_id,action,entity,entity_id,new_values) VALUES(d.organization_id,auth.uid(),'Ofertă trimisă','properties',d.property_id,jsonb_build_object('channel',d.channel,'activity_id',a));
 UPDATE public.offer_client_deliveries SET status='logged',activity_id=a WHERE id=d.id;
 RETURN a;
END $$;
REVOKE ALL ON FUNCTION public.finish_offer_client_delivery(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.finish_offer_client_delivery(uuid) TO authenticated,service_role;