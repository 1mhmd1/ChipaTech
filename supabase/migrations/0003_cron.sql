-- =============================================================
-- Daily cron job that invokes the check-milestones Edge Function.
-- Run AFTER deploying the Edge Function (`supabase functions deploy
-- check-milestones`). Replace the placeholders with your own values
-- before running.
-- =============================================================

-- Enable required extensions (one-time)
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Replace with your project ref + service role key. The service role
-- key is required because the Edge Function reads + writes tables
-- bypassing RLS.
--   <PROJECT_REF>      e.g.  abcdefghijklmnop
--   <SERVICE_ROLE_KEY> in Supabase dashboard → Project Settings → API
do $$
begin
  perform cron.unschedule('trademirror-check-milestones');
exception when others then null;
end $$;

select cron.schedule(
  'trademirror-check-milestones',
  '0 9 * * *',  -- every day at 09:00 UTC
  $cmd$
  select net.http_post(
    url := 'https://<PROJECT_REF>.supabase.co/functions/v1/check-milestones',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer <SERVICE_ROLE_KEY>'
    ),
    body := '{}'::jsonb
  );
  $cmd$
);

-- To verify:
--   select * from cron.job;
-- To inspect the last 10 runs:
--   select * from cron.job_run_details order by start_time desc limit 10;
