-- Public table-service capabilities are now mediated by the rate-limited digital-menu Edge Function.
REVOKE ALL ON FUNCTION public.get_service_table(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_table_service_status(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.request_table_service(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_service_table(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_table_service_status(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.request_table_service(uuid) TO service_role;

COMMENT ON FUNCTION public.get_service_table(uuid) IS
  'Service-role only; public QR lookup is mediated by the rate-limited digital-menu Edge Function.';
COMMENT ON FUNCTION public.get_table_service_status(uuid) IS
  'Service-role only; public QR status is mediated by the rate-limited digital-menu Edge Function.';
COMMENT ON FUNCTION public.request_table_service(uuid) IS
  'Service-role only; public QR calls are mediated by the rate-limited digital-menu Edge Function.';
