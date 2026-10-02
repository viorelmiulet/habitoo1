ALTER TABLE public.organizations
  ADD COLUMN collab_default_commission_percent numeric NULL,
  ADD CONSTRAINT organizations_collab_default_commission_percent_check
    CHECK (
      collab_default_commission_percent IS NULL
      OR (collab_default_commission_percent >= 0 AND collab_default_commission_percent <= 100)
    );