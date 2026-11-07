CREATE OR REPLACE FUNCTION public.create_dynamic_feed_portal(_slug text,_name text,_website text,_xml boolean,_public boolean,_logo text,_prefixes text[],_reserved text[],_reserved_prefixes text[],_key_hash text,_last4 text) RETURNS text LANGUAGE plpgsql SET search_path=public AS $$
DECLARE p text; digest text;
BEGIN
 IF NOT public.is_superadmin() THEN RAISE EXCEPTION 'Acces refuzat'; END IF;
 PERFORM pg_advisory_xact_lock(hashtext('dynamic_feed_portal_create'));
 IF _slug=ANY(_reserved) OR EXISTS(SELECT 1 FROM public.dynamic_feed_portals WHERE slug=_slug) THEN RAISE EXCEPTION 'Identificatorul există deja'; END IF;
 SELECT candidate INTO p FROM unnest(_prefixes) WITH ORDINALITY AS choices(candidate,position) WHERE NOT candidate=ANY(_reserved_prefixes) AND NOT EXISTS(SELECT 1 FROM public.dynamic_feed_portals WHERE key_prefix=candidate) ORDER BY position LIMIT 1;
 IF p IS NULL THEN RAISE EXCEPTION 'Nu există prefix disponibil'; END IF;
 digest=(_key_hash::jsonb)->>p;
 IF digest IS NULL OR digest !~ '^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'Invalid key digest'; END IF;
 IF _logo IS NOT NULL AND (_logo !~ '^[a-z][a-z0-9-]{1,39}/[a-f0-9-]{36}\.(png|jpg|webp)$' OR split_part(_logo,'/',1)<>_slug) THEN RAISE EXCEPTION 'Logo invalid'; END IF;
 INSERT INTO public.dynamic_feed_portals(slug,display_name,website,xml_enabled,show_public,logo_path,key_prefix,created_by) VALUES(_slug,_name,_website,_xml,_public,_logo,p,auth.uid());
 INSERT INTO public.portal_index_keys(portal,prefix,last4,key_hash,created_by) VALUES(_slug,p,_last4,digest,auth.uid());
 INSERT INTO public.audit_logs(actor_id,action,entity,new_values) VALUES(auth.uid(),'dynamic_feed_portal_created','dynamic_feed_portals',jsonb_build_object('slug',_slug,'xml_enabled',_xml,'show_public',_public));
 RETURN p;
END $$;