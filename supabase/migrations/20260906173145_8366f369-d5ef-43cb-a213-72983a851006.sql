ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS legal_name text,
  ADD COLUMN IF NOT EXISTS cui text;

ALTER TYPE public.org_status ADD VALUE IF NOT EXISTS 'pending_approval';
