CREATE TABLE IF NOT EXISTS public.portal_operation_locks (
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  portal text NOT NULL,
  lock_key text NOT NULL,
  owner_token uuid NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, portal, lock_key)
);

GRANT SELECT ON public.portal_operation_locks TO authenticated;
GRANT ALL ON public.portal_operation_locks TO service_role;

ALTER TABLE public.portal_operation_locks ENABLE ROW LEVEL SECURITY;

CREATE POLICY portal_operation_locks_select
ON public.portal_operation_locks FOR SELECT TO authenticated
USING (organization_id = public.current_org() OR public.is_superadmin());

CREATE OR REPLACE FUNCTION public.acquire_portal_operation_lock(
  _organization_id uuid,
  _portal text,
  _lock_key text,
  _owner_token uuid,
  _ttl_seconds integer DEFAULT 120
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _claimed uuid;
BEGIN
  INSERT INTO public.portal_operation_locks (
    organization_id, portal, lock_key, owner_token, expires_at
  ) VALUES (
    _organization_id, _portal, _lock_key, _owner_token,
    now() + make_interval(secs => greatest(10, least(_ttl_seconds, 600)))
  )
  ON CONFLICT (organization_id, portal, lock_key) DO UPDATE
  SET owner_token = EXCLUDED.owner_token,
      expires_at = EXCLUDED.expires_at,
      created_at = now()
  WHERE portal_operation_locks.expires_at <= now()
  RETURNING owner_token INTO _claimed;

  RETURN _claimed = _owner_token;
END;
$$;

REVOKE ALL ON FUNCTION public.acquire_portal_operation_lock(uuid, text, text, uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.acquire_portal_operation_lock(uuid, text, text, uuid, integer) TO service_role;

CREATE OR REPLACE FUNCTION public.release_portal_operation_lock(
  _organization_id uuid,
  _portal text,
  _lock_key text,
  _owner_token uuid
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  DELETE FROM public.portal_operation_locks
  WHERE organization_id = _organization_id
    AND portal = _portal
    AND lock_key = _lock_key
    AND owner_token = _owner_token;
$$;

REVOKE ALL ON FUNCTION public.release_portal_operation_lock(uuid, text, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.release_portal_operation_lock(uuid, text, text, uuid) TO service_role;