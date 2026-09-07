REVOKE EXECUTE ON FUNCTION public.submit_agency_registration_request(text, text, text, text, text, text) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.approve_registration_request(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.reject_registration_request(uuid, text) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.submit_agency_registration_request(text, text, text, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.approve_registration_request(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reject_registration_request(uuid, text) TO authenticated;