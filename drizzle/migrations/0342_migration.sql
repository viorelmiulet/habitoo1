REVOKE EXECUTE ON FUNCTION public.cron_nonce_issue(text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.cron_nonce_claim(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cron_nonce_issue(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.cron_nonce_claim(text, text) TO service_role;