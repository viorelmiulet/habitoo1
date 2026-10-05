ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS public_profile_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS public_slug text,
  ADD COLUMN IF NOT EXISTS public_description text,
  ADD COLUMN IF NOT EXISTS public_hidden_by_admin boolean NOT NULL DEFAULT false;
ALTER TABLE public.organizations
  ADD CONSTRAINT organizations_public_description_len CHECK (public_description IS NULL OR char_length(public_description) <= 600),
  ADD CONSTRAINT organizations_public_slug_format CHECK (public_slug IS NULL OR public_slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$');
CREATE UNIQUE INDEX IF NOT EXISTS organizations_public_slug_key ON public.organizations (public_slug) WHERE public_slug IS NOT NULL;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS public_profile_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS public_slug text,
  ADD COLUMN IF NOT EXISTS public_bio text,
  ADD COLUMN IF NOT EXISTS public_show_phone boolean NOT NULL DEFAULT false;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_public_bio_len CHECK (public_bio IS NULL OR char_length(public_bio) <= 400),
  ADD CONSTRAINT profiles_public_slug_format CHECK (public_slug IS NULL OR public_slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$');
CREATE UNIQUE INDEX IF NOT EXISTS profiles_public_slug_key ON public.profiles (public_slug) WHERE public_slug IS NOT NULL;

CREATE OR REPLACE FUNCTION public.public_slugify(_v text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT nullif(btrim(regexp_replace(lower(translate(coalesce(_v,''),
    'ĂÂÎȘŞȚŢăâîșşțţÁÀÄÉÈËÍÏÓÖÚÜÇáàäéèëíïóöúüç',
    'AAISSTTaaissttAAAEEEIIOOUUCaaaeeeiioouuc')), '[^a-z0-9]+', '-', 'g'), '-'), '');
$$;

-- Slug unic: baza, apoi baza-2, baza-3 ...
CREATE OR REPLACE FUNCTION public.public_unique_slug(_table text, _base text, _id uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  base text := coalesce(public.public_slugify(_base), 'profil');
  candidate text := base;
  n int := 1;
  taken boolean;
BEGIN
  LOOP
    IF _table = 'organizations' THEN
      SELECT EXISTS (SELECT 1 FROM public.organizations WHERE public_slug = candidate AND id <> _id) INTO taken;
    ELSE
      SELECT EXISTS (SELECT 1 FROM public.profiles WHERE public_slug = candidate AND id <> _id) INTO taken;
    END IF;
    EXIT WHEN NOT taken;
    n := n + 1;
    candidate := base || '-' || n;
  END LOOP;
  RETURN candidate;
END;
$$;
REVOKE ALL ON FUNCTION public.public_unique_slug(text, text, uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.guard_org_public_fields()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF current_user IN ('authenticated','anon') AND NOT public.is_superadmin() THEN
    IF NEW.public_hidden_by_admin IS DISTINCT FROM OLD.public_hidden_by_admin THEN
      RAISE EXCEPTION 'Doar superadminul poate ascunde agenția din catalogul public.' USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;
  IF NEW.public_slug IS NOT NULL THEN
    NEW.public_slug := lower(btrim(NEW.public_slug));
  END IF;
  IF NEW.public_profile_enabled AND NEW.public_slug IS NULL THEN
    NEW.public_slug := public.public_unique_slug('organizations', NEW.name, NEW.id);
  END IF;
  NEW.public_description := nullif(btrim(NEW.public_description), '');
  RETURN NEW;
END;
$$;
CREATE TRIGGER t_org_public_fields BEFORE UPDATE ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.guard_org_public_fields();

CREATE OR REPLACE FUNCTION public.guard_profile_public_fields()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF current_user IN ('authenticated','anon') AND OLD.id IS DISTINCT FROM auth.uid() AND NOT public.is_superadmin() THEN
    IF NEW.public_profile_enabled IS DISTINCT FROM OLD.public_profile_enabled
       OR NEW.public_slug IS DISTINCT FROM OLD.public_slug
       OR NEW.public_bio IS DISTINCT FROM OLD.public_bio
       OR NEW.public_show_phone IS DISTINCT FROM OLD.public_show_phone THEN
      RAISE EXCEPTION 'Profilul public poate fi modificat doar de agentul însuși.' USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;
  IF NEW.public_profile_enabled AND NEW.public_slug IS NULL THEN
    NEW.public_slug := public.public_unique_slug('profiles', NEW.full_name, NEW.id);
  END IF;
  NEW.public_bio := nullif(btrim(NEW.public_bio), '');
  RETURN NEW;
END;
$$;
CREATE TRIGGER t_profile_public_fields BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.guard_profile_public_fields();

-- Citire publică: doar câmpuri publice, fără id-uri, email, CUI sau telefonul agenției.
CREATE OR REPLACE FUNCTION public.public_agencies_list()
RETURNS TABLE (slug text, name text, city text, description text, logo_path text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT o.public_slug, o.name, o.city, o.public_description, o.logo_path
  FROM public.organizations o
  WHERE o.public_profile_enabled AND NOT o.public_hidden_by_admin
    AND o.public_slug IS NOT NULL AND o.archived_at IS NULL
    AND o.status IN ('active','trial')
  ORDER BY o.name;
$$;

CREATE OR REPLACE FUNCTION public.public_agency_by_slug(_slug text)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'slug', o.public_slug, 'name', o.name, 'city', o.city,
    'description', o.public_description, 'logo_path', o.logo_path,
    'agents', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'slug', p.public_slug, 'full_name', p.full_name, 'job_title', p.job_title,
        'bio', p.public_bio, 'avatar_path', p.avatar_url,
        'phone', CASE WHEN p.public_show_phone THEN p.phone ELSE NULL END
      ) ORDER BY p.full_name)
      FROM public.profiles p
      WHERE p.organization_id = o.id AND p.public_profile_enabled AND p.is_active
        AND p.public_slug IS NOT NULL
    ), '[]'::jsonb)
  )
  FROM public.organizations o
  WHERE o.public_slug = lower(_slug)
    AND o.public_profile_enabled AND NOT o.public_hidden_by_admin
    AND o.archived_at IS NULL AND o.status IN ('active','trial');
$$;

REVOKE ALL ON FUNCTION public.public_agencies_list() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.public_agency_by_slug(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.public_agencies_list() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.public_agency_by_slug(text) TO anon, authenticated, service_role;