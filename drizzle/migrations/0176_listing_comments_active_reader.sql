ALTER POLICY "Agents can read listing comments"
ON public.listing_comments
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.profiles AS p
    JOIN public.organizations AS o ON o.id = p.organization_id
    WHERE p.id = (SELECT auth.uid())
      AND p.is_active = true
      AND o.status IN ('active', 'trial')
      AND o.archived_at IS NULL
  )
);