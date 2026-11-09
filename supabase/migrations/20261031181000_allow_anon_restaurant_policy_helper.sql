-- Anonymous menu readers must be able to evaluate restaurant RLS policies.
-- The helper returns NULL when auth.uid() is NULL, so it reveals no profile data.
GRANT EXECUTE ON FUNCTION public.get_user_restaurant_id(uuid) TO anon;
