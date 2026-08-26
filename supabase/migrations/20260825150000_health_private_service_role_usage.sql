-- Production already has the member-scoped RLS lockdown. Health workers also
-- need schema usage before the health core creates its private RPCs.
grant usage on schema private to service_role;
