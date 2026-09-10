CREATE TABLE public.portal_messages (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  portal text NOT NULL,
  property_id uuid REFERENCES public.properties(id) ON DELETE SET NULL,
  lead_id uuid REFERENCES public.leads(id) ON DELETE CASCADE,
  external_message_id text,
  sender_name text,
  sender_email text,
  sender_phone text,
  body text,
  sent_at timestamp with time zone NOT NULL DEFAULT now(),
  expires_at timestamp with time zone NOT NULL DEFAULT (now() + interval '180 days'),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT ON public.portal_messages TO authenticated;
GRANT ALL ON public.portal_messages TO service_role;

ALTER TABLE public.portal_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members read portal messages"
ON public.portal_messages FOR SELECT TO authenticated
USING (
  public.is_superadmin()
  OR (
    organization_id = public.current_org()
    AND (
      public.is_org_admin()
      OR lead_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.leads l
        WHERE l.id = portal_messages.lead_id
          AND l.assigned_to = auth.uid()
      )
    )
  )
);

CREATE UNIQUE INDEX portal_messages_portal_external_key
  ON public.portal_messages (portal, organization_id, external_message_id)
  WHERE external_message_id IS NOT NULL;

CREATE INDEX portal_messages_lead_idx ON public.portal_messages (lead_id, sent_at DESC);
CREATE INDEX portal_messages_expires_idx ON public.portal_messages (expires_at);

CREATE TRIGGER portal_messages_touch_updated_at
BEFORE UPDATE ON public.portal_messages
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE OR REPLACE FUNCTION public.purge_expired_portal_messages()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE removed integer;
BEGIN
  DELETE FROM public.portal_messages WHERE expires_at <= now();
  GET DIAGNOSTICS removed = ROW_COUNT;
  RETURN removed;
END;
$$;

REVOKE ALL ON FUNCTION public.purge_expired_portal_messages() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.purge_expired_portal_messages() TO service_role;