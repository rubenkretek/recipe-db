-- Trigger functions live in the public schema, so PostgREST exposes them at
-- /rest/v1/rpc/<name> and grants EXECUTE to anon and authenticated by default.
--
-- Neither is callable in a meaningful way outside a trigger (both reference the
-- `new` record, so a direct call errors), but handle_new_user() is
-- security definer and should not appear on the API surface at all.

revoke execute on function public.handle_new_user() from anon, authenticated, public;
revoke execute on function public.set_updated_at() from anon, authenticated, public;
