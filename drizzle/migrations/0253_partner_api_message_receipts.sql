CREATE OR REPLACE FUNCTION public.partner_api_message_apply(_portal text,_environment text,_lead uuid,_external text,_body text,_created timestamptz) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE l leads; mid uuid; org uuid; msgkey text;
BEGIN
 SELECT organization_id INTO org FROM partner_api_lead_receipts WHERE portal=_portal AND environment=_environment AND lead_id=_lead AND completed LIMIT 1;
 IF org IS NULL OR NOT partner_api_write_allowed(_portal,_environment,org) THEN RETURN jsonb_build_object('not_found',true); END IF;
 SELECT * INTO l FROM leads WHERE id=_lead AND organization_id=org AND deleted_at IS NULL;
 IF NOT FOUND THEN RETURN jsonb_build_object('not_found',true); END IF;
 msgkey:='partner:'||_environment||':message:'||encode(sha256(convert_to(_external,'UTF8')),'hex');
 INSERT INTO portal_messages(organization_id,portal,property_id,lead_id,external_message_id,conversation_id,sender_name,body,sent_at,direction) VALUES(org,_portal,l.property_id,_lead,msgkey,'partner:'||_environment||':'||_lead::text,l.name,_body,coalesce(_created,now()),'in') ON CONFLICT DO NOTHING RETURNING id INTO mid;
 IF mid IS NULL THEN
  SELECT id INTO mid FROM portal_messages WHERE portal=_portal AND organization_id=org AND external_message_id=msgkey AND lead_id=_lead;
  IF mid IS NULL THEN RETURN jsonb_build_object('conflict',true); END IF;
  RETURN jsonb_build_object('id',mid,'deduplicated',true);
 END IF;
 UPDATE leads SET last_interaction_at=now() WHERE id=_lead;
 INSERT INTO lead_events(organization_id,lead_id,to_stage,note) VALUES(org,_lead,l.stage,left(_body,2000));
 RETURN jsonb_build_object('id',mid,'deduplicated',false);
END $$;
REVOKE ALL ON FUNCTION public.partner_api_message_apply(text,text,uuid,text,text,timestamptz) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.partner_api_message_apply(text,text,uuid,text,text,timestamptz) TO service_role;
CREATE INDEX partner_api_statistics_property_date_idx ON public.partner_api_statistics(property_id,date);
CREATE INDEX partner_api_publications_org_idx ON public.partner_api_publications(organization_id,property_id);