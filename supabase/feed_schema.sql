-- Project tax-feed (xtclbtklsreqhmcwvoeo)
-- Separate schema so nothing touches clients, matters, payments or case_laws.
create schema if not exists feed;
create extension if not exists pg_trgm;

create table feed.updates (
  id             uuid primary key default gen_random_uuid(),
  source_key     text not null unique,          -- e.g. '2026-10-26:dg-004'; makes the daily job idempotent
  published_on   date not null,                 -- day the mail arrived (IST)
  order_date     date,                          -- date of order, only where the source states it
  law            text not null,                 -- Income-tax, GST, IBC ...
  type           text not null,                 -- Case law, ITAT order, Circular / notification ...
  party          text,
  court          text,
  section        text,
  subject        text,
  citation       text,
  ref_no         text,
  assessment_year text,
  para           text,
  favour         text,
  judge          text,
  counsel        text,
  held           text,
  conclusion     text,
  full_text      text,                          -- verbatim source text; never exposed publicly
  source         text not null,                 -- Taxmann alert / digest / Current Tax Online
  source_url     text,
  created_at     timestamptz not null default now()
);
create index on feed.updates (published_on desc);
create index on feed.updates (law, type);
create index on feed.updates using gin (party gin_trgm_ops);
create index on feed.updates using gin (subject gin_trgm_ops);

alter table feed.updates enable row level security;
-- No policies for anon. Writes: service role only (the daily job), never a browser.
-- Team read policy: to be tied to public.team_members once you confirm which column maps to auth.uid().

-- The only public door: a view in public (feed schema stays unexposed). Metadata only, previous days only.
create view public.updates_public with (security_invoker = false) as
  select id, published_on, order_date, law, type, party, court, section, subject,
         citation, ref_no, assessment_year, favour, source, source_url
  from feed.updates
  where published_on < (now() at time zone 'Asia/Kolkata')::date;
revoke all on public.updates_public from public, anon, authenticated;
grant select on public.updates_public to anon;
revoke all on schema feed from anon, authenticated;
revoke all on all tables in schema feed from anon, authenticated;
