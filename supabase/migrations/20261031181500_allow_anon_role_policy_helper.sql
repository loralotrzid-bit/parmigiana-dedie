-- Public RLS checks call has_role; anonymous callers safely receive false.
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO anon;
