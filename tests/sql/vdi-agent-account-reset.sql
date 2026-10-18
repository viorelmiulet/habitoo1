-- Regression test against the existing MRM VDI fixture. No portal requests.
-- Every change is rolled back, including the temporary account change.
BEGIN;
DO $$
DECLARE
  org_id uuid := 'f255a149-456c-48bc-a6d7-6219741cfe0d';
  affected integer;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.portal_connections WHERE organization_id=org_id AND portal='vdi' AND external_account_id='755') THEN
    RAISE EXCEPTION 'Expected MRM VDI account 755';
  END IF;

  UPDATE public.portal_agent_links
  SET external_account_id='755', synced_at=now(), sent_fingerprint='test-account-reset'
  WHERE organization_id=org_id AND portal='vdi' AND external_id IN (1000,1013);
  GET DIAGNOSTICS affected = ROW_COUNT;
  IF affected <> 2 THEN RAISE EXCEPTION 'Expected both MRM agent links'; END IF;

  -- Saving the same account must preserve sync.
  UPDATE public.portal_connections SET external_account_id='755'
  WHERE organization_id=org_id AND portal='vdi';
  IF (SELECT count(*) FROM public.portal_agent_links WHERE organization_id=org_id AND portal='vdi' AND external_id IN (1000,1013) AND synced_at IS NOT NULL AND sent_fingerprint='test-account-reset') <> 2 THEN
    RAISE EXCEPTION 'Unchanged account unexpectedly reset agent links';
  END IF;

  UPDATE public.portal_connections SET external_account_id='720'
  WHERE organization_id=org_id AND portal='vdi';
  IF (SELECT count(*) FROM public.portal_agent_links WHERE organization_id=org_id AND portal='vdi' AND external_id IN (1000,1013) AND synced_at IS NULL AND sent_fingerprint IS NULL AND external_account_id='755') <> 2 THEN
    RAISE EXCEPTION 'Changed account did not reset both agents or lost their origin account';
  END IF;
END;
$$;
ROLLBACK;