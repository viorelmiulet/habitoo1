CREATE OR REPLACE FUNCTION public.development_unit_operation_advance(_job_id uuid,_index integer,_reason text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE j record; item jsonb; key text; BEGIN
 SELECT * INTO j FROM public.development_clone_jobs WHERE id=_job_id FOR UPDATE;
 IF j.id IS NULL OR j.operation='clone' OR j.status<>'running' OR j.processed<>_index THEN RETURN; END IF;
 item:=coalesce(j.current_item,jsonb_build_object('propertyId',j.property_ids[_index+1]));
 key:=CASE WHEN _reason IS NULL THEN 'succeeded' ELSE 'failed' END;
 UPDATE public.development_clone_jobs SET result=result||jsonb_build_object(key,coalesce(result->key,'[]'::jsonb)||jsonb_build_array(item||jsonb_build_object('reason',_reason))),processed=_index+1,current_item=NULL,attempts=0 WHERE id=_job_id; END $$;
REVOKE ALL ON FUNCTION public.development_unit_operation_advance(uuid,integer,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.development_unit_operation_advance(uuid,integer,text) TO service_role;