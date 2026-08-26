-- Anonymous Squad Health Check core. Individual scores exist only in the
-- submit call and are folded directly into aggregate counters.

do $preflight$
declare
  v_session_quals text[] := array[
    '(SELECTprivate.is_session_member(sessions.id)ASis_session_member)',
    '(SELECTprivate.is_session_member(id)ASis_session_member)'
  ];
  v_participant_quals text[] := array[
    '(SELECTprivate.is_session_member(participants.session_id)ASis_session_member)',
    '(SELECTprivate.is_session_member(session_id)ASis_session_member)'
  ];
begin
  if not coalesce((
    select bool_and(c.relrowsecurity)
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relname in ('sessions', 'participants')
     having count(*) = 2
  ), false) or (
    select count(*) <> 1
      from pg_policies
     where schemaname = 'public' and tablename = 'sessions'
       and cmd = 'SELECT' and permissive = 'PERMISSIVE'
       and roles = array['authenticated'::name]
       and regexp_replace(coalesce(qual, ''), '\s+', '', 'g') = any (v_session_quals)
  ) or (
    select count(*) <> 1
      from pg_policies
     where schemaname = 'public' and tablename = 'participants'
       and cmd = 'SELECT' and permissive = 'PERMISSIVE'
       and roles = array['authenticated'::name]
       and regexp_replace(coalesce(qual, ''), '\s+', '', 'g') = any (v_participant_quals)
  ) or (
    select count(*)
      from pg_policies
     where schemaname = 'public'
       and tablename in ('sessions', 'participants')
       and cmd = 'SELECT'
  ) <> 2 or exists (
    select 1
      from pg_policies
     where schemaname = 'public'
       and tablename in ('sessions', 'participants')
       and cmd <> 'SELECT'
  ) or exists (
    select 1
      from unnest(array['sessions', 'participants']) as tables(table_name)
      cross join unnest(array['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER']) as privileges(privilege)
     where has_table_privilege('anon', format('public.%I', tables.table_name), privileges.privilege)
  ) or exists (
    select 1
      from unnest(array['sessions', 'participants']) as tables(table_name)
      join pg_class c on c.relname = tables.table_name
      join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
      join pg_attribute a on a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
      cross join unnest(array['SELECT', 'INSERT', 'UPDATE', 'REFERENCES']) as privileges(privilege)
     where has_column_privilege('anon', c.oid, a.attnum, privileges.privilege)
  ) or exists (
    select 1
      from unnest(array['sessions', 'participants']) as tables(table_name)
      cross join unnest(array['INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER']) as privileges(privilege)
     where has_table_privilege('authenticated', format('public.%I', tables.table_name), privileges.privilege)
  ) or exists (
    select 1
      from unnest(array['sessions', 'participants']) as tables(table_name)
      join pg_class c on c.relname = tables.table_name
      join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
      join pg_attribute a on a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
      cross join unnest(array['INSERT', 'UPDATE', 'REFERENCES']) as privileges(privilege)
     where has_column_privilege('authenticated', c.oid, a.attnum, privileges.privilege)
  ) or has_table_privilege('authenticated', 'public.sessions', 'SELECT')
     or has_table_privilege('authenticated', 'public.participants', 'SELECT')
     or exists (
       select 1
         from pg_attribute a
        where a.attrelid = 'public.sessions'::regclass
          and a.attnum > 0 and not a.attisdropped
          and has_column_privilege('authenticated', a.attrelid, a.attnum, 'SELECT')
              is distinct from (a.attname = any (array[
                'id', 'activity_type', 'consensus_streak', 'created_at',
                'current_round', 'join_code', 'started', 'status', 'votes_revealed'
              ]))
     ) or exists (
       select 1
         from pg_attribute a
        where a.attrelid = 'public.participants'::regclass
          and a.attnum > 0 and not a.attisdropped
          and has_column_privilege('authenticated', a.attrelid, a.attnum, 'SELECT')
              is distinct from (a.attname = any (array[
                'id', 'joined_at', 'left_at', 'name', 'role', 'session_id'
              ]))
     ) then
    raise exception 'health_check_requires_member_scoped_room_rls' using errcode = '55000';
  end if;
end;
$preflight$;

do $private_schema_preflight$
begin
  if to_regnamespace('private') is null
     or not coalesce(
       has_schema_privilege('service_role', to_regnamespace('private'), 'USAGE'),
       false
     ) then
    raise exception 'health_check_requires_private_service_role_usage' using errcode = '55000';
  end if;
end;
$private_schema_preflight$;

revoke all on schema private from public, anon;

create table public.health_check_templates (
  version text primary key,
  area_count smallint not null check (area_count = 7),
  question_count smallint not null check (question_count = 31),
  created_at timestamptz not null default now()
);

create table public.health_check_areas (
  template_version text not null references public.health_check_templates(version),
  area_key text not null,
  sequence smallint not null check (sequence between 1 and 7),
  title text not null,
  introduction text not null,
  description text not null,
  primary key (template_version, area_key),
  unique (template_version, sequence)
);

create table public.health_check_questions (
  template_version text not null,
  question_key text not null,
  area_key text not null,
  sequence smallint not null check (sequence between 1 and 31),
  text text not null,
  primary key (template_version, question_key),
  unique (template_version, sequence),
  foreign key (template_version, area_key)
    references public.health_check_areas(template_version, area_key)
);

create table public.health_check_sessions (
  room_id uuid primary key references public.sessions(id) on delete cascade,
  delivery_id uuid not null unique,
  template_version text not null references public.health_check_templates(version),
  phase text not null default 'lobby'
    check (phase in ('lobby', 'collecting', 'download_pending')),
  squad_name text not null check (
    squad_name = btrim(squad_name)
    and char_length(squad_name) between 1 and 80
    and squad_name !~ '[[:cntrl:]]'
  ),
  measurement_date date not null,
  opened_at timestamptz,
  expires_at timestamptz not null,
  unique (room_id, template_version),
  unique (room_id, delivery_id)
);

create table public.health_check_respondents (
  room_id uuid not null references public.health_check_sessions(room_id) on delete cascade,
  member_id uuid not null,
  state text not null default 'in_progress'
    check (state in ('in_progress', 'completed')),
  primary key (room_id, member_id),
  foreign key (room_id, member_id)
    references public.participants(session_id, id)
    on delete cascade
);

create table public.health_check_question_aggregates (
  room_id uuid not null,
  template_version text not null,
  question_key text not null,
  score_sum bigint not null default 0,
  response_count integer not null default 0,
  primary key (room_id, question_key),
  foreign key (room_id, template_version)
    references public.health_check_sessions(room_id, template_version)
    on delete cascade,
  foreign key (template_version, question_key)
    references public.health_check_questions(template_version, question_key),
  check (
    response_count >= 0
    and score_sum >= response_count
    and score_sum <= response_count::bigint * 7
  )
);

create table public.health_check_report_jobs (
  id uuid primary key,
  source_room_id uuid unique references public.health_check_sessions(room_id) on delete set null,
  facilitator_user_id uuid not null references auth.users(id),
  aad_room_id uuid not null,
  encrypted_package bytea check (
    encrypted_package is null
    or octet_length(encrypted_package) between 17 and 4194320
  ),
  package_nonce bytea check (package_nonce is null or octet_length(package_nonce) = 12),
  encryption_key_version integer check (
    encryption_key_version is null or encryption_key_version > 0
  ),
  sanitized_filename text check (
    sanitized_filename is null
    or (
      sanitized_filename = btrim(sanitized_filename)
      and char_length(sanitized_filename) between 5 and 180
      and sanitized_filename !~ '[[:cntrl:]/\\]'
      and right(lower(sanitized_filename), 4) = '.zip'
    )
  ),
  status text not null default 'awaiting_materialization'
    check (status in ('awaiting_materialization', 'processing', 'ready', 'failed')),
  attempts integer not null default 0 check (attempts >= 0),
  next_attempt_at timestamptz not null default now(),
  claimed_by text,
  lease_expires_at timestamptz,
  materialized_at timestamptz,
  expires_at timestamptz not null,
  idempotency_key text not null unique,
  created_at timestamptz not null default now(),
  check (
    (claimed_by is null) = (lease_expires_at is null)
  ),
  check (
    (encrypted_package is null and package_nonce is null
      and encryption_key_version is null and sanitized_filename is null
      and materialized_at is null)
    or (encrypted_package is not null and package_nonce is not null
      and encryption_key_version is not null and sanitized_filename is not null
      and materialized_at is not null)
  ),
  check (
    status <> 'awaiting_materialization'
    or (
      source_room_id is not null and encrypted_package is null
      and claimed_by is null and lease_expires_at is null
    )
  ),
  check (
    status <> 'processing'
    or (
      source_room_id is not null and encrypted_package is null
      and claimed_by is not null and lease_expires_at is not null
    )
  ),
  check (
    status <> 'failed'
    or (
      encrypted_package is null
      and claimed_by is null and lease_expires_at is null
    )
  ),
  check (
    status <> 'ready'
    or (
      source_room_id is null and encrypted_package is not null
      and claimed_by is null and lease_expires_at is null
      and expires_at > materialized_at
      and expires_at <= materialized_at + interval '15 minutes'
    )
  )
);

create index health_check_respondents_member_idx
  on public.health_check_respondents(member_id);
create index health_check_report_jobs_work_idx
  on public.health_check_report_jobs(status, next_attempt_at)
  where status in ('awaiting_materialization', 'failed');
create index health_check_report_jobs_expiry_idx
  on public.health_check_report_jobs(expires_at);
create index health_check_sessions_expiry_idx
  on public.health_check_sessions(expires_at);

alter table public.health_check_templates enable row level security;
alter table public.health_check_areas enable row level security;
alter table public.health_check_questions enable row level security;
alter table public.health_check_sessions enable row level security;
alter table public.health_check_respondents enable row level security;
alter table public.health_check_question_aggregates enable row level security;
alter table public.health_check_report_jobs enable row level security;

create function private.prevent_health_catalog_mutation()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $function$
begin
  raise exception 'health_check_catalog_is_immutable' using errcode = '55000';
end;
$function$;

create trigger health_check_templates_immutable
before update or delete on public.health_check_templates
for each row execute function private.prevent_health_catalog_mutation();
create trigger health_check_areas_immutable
before update or delete on public.health_check_areas
for each row execute function private.prevent_health_catalog_mutation();
create trigger health_check_questions_immutable
before update or delete on public.health_check_questions
for each row execute function private.prevent_health_catalog_mutation();

create function private.validate_health_check_expiry()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $function$
begin
  if tg_op = 'UPDATE' and new.expires_at is distinct from old.expires_at then
    raise exception 'health_check_expiry_is_immutable' using errcode = '22023';
  end if;
  if new.expires_at <= clock_timestamp()
     or new.expires_at > clock_timestamp() + interval '23 hours 55 minutes' then
    raise exception 'invalid_health_check_expiry' using errcode = '22023';
  end if;
  return new;
end;
$function$;

create trigger health_check_sessions_validate_expiry
before insert or update on public.health_check_sessions
for each row execute function private.validate_health_check_expiry();

create function private.validate_health_check_room_type()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $function$
begin
  if not exists (
    select 1 from public.sessions s
     where s.id = new.room_id and s.activity_type = 'health_check'
  ) then
    raise exception 'health_check_room_type_mismatch' using errcode = '23514';
  end if;
  return new;
end;
$function$;

create trigger health_check_sessions_validate_room_type
before insert or update of room_id on public.health_check_sessions
for each row execute function private.validate_health_check_room_type();

create function private.prevent_health_check_room_type_change()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $function$
begin
  if new.activity_type is distinct from old.activity_type
     and exists (
       select 1 from public.health_check_sessions h where h.room_id = old.id
     ) then
    raise exception 'health_check_room_type_is_immutable' using errcode = '23514';
  end if;
  return new;
end;
$function$;

create trigger sessions_preserve_health_check_room_type
before update of activity_type on public.sessions
for each row execute function private.prevent_health_check_room_type_change();

create function private.validate_health_report_job_state()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  v_source_expires_at timestamptz;
  v_source_delivery_id uuid;
  v_source_facilitator_user_id uuid;
begin
  if tg_op = 'UPDATE' and old.status = 'ready' and new is distinct from old then
    raise exception 'health_check_report_job_ready_is_immutable' using errcode = '23514';
  end if;

  if tg_op = 'UPDATE' and (
    new.id is distinct from old.id
    or new.aad_room_id is distinct from old.aad_room_id
    or new.facilitator_user_id is distinct from old.facilitator_user_id
    or new.idempotency_key is distinct from old.idempotency_key
    or new.created_at is distinct from old.created_at
  ) then
    raise exception 'health_check_report_job_identity_is_immutable' using errcode = '23514';
  end if;

  if tg_op = 'UPDATE' and not (
    (old.status = 'awaiting_materialization' and new.status in ('awaiting_materialization', 'processing', 'failed'))
    or (old.status = 'processing' and new.status in ('processing', 'awaiting_materialization', 'ready', 'failed'))
    or (old.status = 'failed' and new.status in ('failed', 'processing', 'awaiting_materialization'))
    or (old.status = 'ready' and new.status = 'ready')
  ) then
    raise exception 'health_check_report_job_transition_is_invalid' using errcode = '23514';
  end if;
  if tg_op = 'UPDATE' and old.status in ('failed', 'awaiting_materialization')
     and old.expires_at <= clock_timestamp() then
    raise exception 'health_check_report_job_is_expired' using errcode = '23514';
  end if;
  if tg_op = 'UPDATE' and new.attempts < old.attempts then
    raise exception 'health_check_report_job_attempts_cannot_decrease' using errcode = '23514';
  end if;
  select h.expires_at, h.delivery_id, s.facilitator_user_id
    into v_source_expires_at, v_source_delivery_id, v_source_facilitator_user_id
    from public.health_check_sessions h
    join public.sessions s on s.id = h.room_id
   where h.room_id = new.source_room_id;

  if new.status <> 'ready' then
    if new.source_room_id is distinct from new.aad_room_id
       or v_source_expires_at is null or v_source_delivery_id is distinct from new.id
       or v_source_facilitator_user_id is distinct from new.facilitator_user_id then
      raise exception 'health_check_report_job_source_mismatch' using errcode = '23514';
    end if;
    if new.expires_at is distinct from v_source_expires_at then
      raise exception 'health_check_report_job_expiry_mismatch' using errcode = '23514';
    end if;
  end if;

  if tg_op = 'UPDATE'
     and old.encrypted_package is not null
     and (
       new.encrypted_package is distinct from old.encrypted_package
       or new.package_nonce is distinct from old.package_nonce
       or new.encryption_key_version is distinct from old.encryption_key_version
       or new.sanitized_filename is distinct from old.sanitized_filename
       or new.materialized_at is distinct from old.materialized_at
     ) then
    raise exception 'health_check_report_package_is_immutable' using errcode = '23514';
  end if;
  return new;
end;
$function$;

create trigger health_check_report_jobs_validate_state
before insert or update on public.health_check_report_jobs
for each row execute function private.validate_health_report_job_state();

create or replace function private.is_session_member(p_session_id uuid)
returns boolean
language sql
security definer
set search_path = pg_catalog
as $function$
  select auth.uid() is not null
    and exists (
      select 1
        from public.participants p
        join public.sessions s on s.id = p.session_id
       where p.session_id = p_session_id
         and p.user_id = auth.uid()
         and p.left_at is null
         and (
           s.activity_type = 'estimation'
           or exists (
             select 1 from public.health_check_sessions h
               where h.room_id = s.id and h.expires_at > clock_timestamp()
           )
         )
    );
$function$;

create or replace function private.can_access_presence_topic(p_topic text)
returns boolean
language sql
security definer
set search_path = pg_catalog
as $function$
  select auth.uid() is not null
    and exists (
      select 1
        from public.participants p
        join public.sessions s on s.id = p.session_id
       where p.user_id = auth.uid()
         and p.left_at is null
         and (
           s.activity_type = 'estimation'
           or exists (
             select 1 from public.health_check_sessions h
               where h.room_id = s.id and h.expires_at > clock_timestamp()
           )
         )
         and (
           p_topic = 'session:' || p.session_id::text
           or p_topic like 'session:' || p.session_id::text || ':%'
         )
    );
$function$;

insert into public.health_check_templates (version, area_count, question_count)
values ('squad-health-v1', 7, 31);

insert into public.health_check_areas (
  template_version, area_key, sequence, title, introduction, description
) values
  ('squad-health-v1', 'joy_energy', 1, 'Arbeidsglede og energi',
   'Er det fortsatt gøy å gå på jobb?',
   'Arbeidsglede, motivasjon, energi og om arbeidshverdagen oppleves bærekraftig.'),
  ('squad-health-v1', 'people_safety', 2, 'Menneskene og tryggheten',
   'Kan vi være mennesker, ikke bare ressurser?',
   'Psykologisk trygghet, omsorg, hjelpekultur og bærekraftig arbeidsbelastning.'),
  ('squad-health-v1', 'direction_meaning', 3, 'Oppgaver, retning og mening',
   'Vet vi hvor vi skal, og hvorfor kunden bør bry seg?',
   'Formål, kundeverdi, inspirasjon, fokus og teamets mulighet til å påvirke.'),
  ('squad-health-v1', 'quality_technical_health', 4, 'Kvalitet og teknisk helse',
   'Er løsningen i god teknisk form, eller holdes den sammen med gaffateip?',
   'Opplevd kvalitet, teknisk gjeld, leveransetrygghet og læring etter feil.'),
  ('squad-health-v1', 'squad_collaboration', 5, 'Samarbeid i squaden',
   'Spiller fagområdene på samme lag?',
   'Tverrfaglighet, involvering, likeverdig påvirkning og kunnskapsdeling.'),
  ('squad-health-v1', 'organization_collaboration', 6, 'Samarbeid med resten av organisasjonen',
   'Er vi del av en velfungerende verdikjede?',
   'Samarbeid på tvers, avhengigheter, støtte og hvordan bistand til andre team påvirker fokus.'),
  ('squad-health-v1', 'learning_improvement', 7, 'Læring og forbedring',
   'Blir vi litt klokere mellom hver produksjonssetting?',
   'Læringskultur, forbedringsevne og bruk av analyse og innsikt.');

insert into public.health_check_questions (
  template_version, question_key, area_key, sequence, text
) values
  ('squad-health-v1', 'joy_look_forward', 'joy_energy', 1, 'Jeg gleder meg som regel til arbeidsdagen.'),
  ('squad-health-v1', 'joy_energy_balance', 'joy_energy', 2, 'Oppgavene mine gir meg mer energi enn de tapper meg for.'),
  ('squad-health-v1', 'joy_fun_together', 'joy_energy', 3, 'Vi har det gøy sammen, også når handlekurven velter.'),
  ('squad-health-v1', 'joy_challenge_mastery', 'joy_energy', 4, 'Jeg opplever at det er en god balanse mellom utfordringer og mestring.'),
  ('squad-health-v1', 'safety_speak_up', 'people_safety', 5, 'Jeg føler meg trygg på å si hva jeg mener i teamet.'),
  ('squad-health-v1', 'safety_learn_from_mistakes', 'people_safety', 6, 'Det er greit å gjøre feil, så lenge vi lærer og rydder opp etter oss.'),
  ('squad-health-v1', 'safety_people_care', 'people_safety', 7, 'Jeg opplever at menneskene rundt meg bryr seg om hvordan jeg har det.'),
  ('squad-health-v1', 'safety_ask_for_help', 'people_safety', 8, 'Jeg kan be om hjelp før varsellampene begynner å blinke.'),
  ('squad-health-v1', 'safety_sustainable_pace', 'people_safety', 9, 'Arbeidshverdagen min har et tempo jeg kan stå i over tid.'),
  ('squad-health-v1', 'direction_understand_outcome', 'direction_meaning', 10, 'Jeg forstår hva teamet prøver å oppnå, ikke bare hva vi skal levere.'),
  ('squad-health-v1', 'direction_meaningful_work', 'direction_meaning', 11, 'Oppgavene jeg jobber med oppleves meningsfulle og inspirerende.'),
  ('squad-health-v1', 'direction_customer_value', 'direction_meaning', 12, 'Vi ser en tydelig sammenheng mellom arbeidet vårt og verdi for kunder, rådgivere eller Gjensidige.'),
  ('squad-health-v1', 'direction_clear_priorities', 'direction_meaning', 13, 'Vi har tydelige prioriteringer og slipper å forsikre alt mot alt samtidig.'),
  ('squad-health-v1', 'direction_autonomy', 'direction_meaning', 14, 'Vi får påvirke hvordan vi løser oppgavene, ikke bare ekspedere bestillingen.'),
  ('squad-health-v1', 'quality_proud_to_ship', 'quality_technical_health', 15, 'Vi leverer løsninger vi er stolte av å sende ut til kundene.'),
  ('squad-health-v1', 'quality_time_to_do_well', 'quality_technical_health', 16, 'Vi har nok tid og rom til å gjøre jobben skikkelig.'),
  ('squad-health-v1', 'quality_debt_managed', 'quality_technical_health', 17, 'Teknisk gjeld og andre kvalitetsproblemer blir håndtert før de blir en dyr egenandel.'),
  ('squad-health-v1', 'quality_safe_changes', 'quality_technical_health', 18, 'Det føles trygt og forutsigbart å gjøre endringer og produksjonssette.'),
  ('squad-health-v1', 'quality_learn_without_blame', 'quality_technical_health', 19, 'Vi oppdager og lærer av feil uten å lete etter noen å skylde på.'),
  ('squad-health-v1', 'squad_involved_early', 'squad_collaboration', 20, 'Utvikling, design og analyse blir involvert tidlig nok i arbeidet.'),
  ('squad-health-v1', 'squad_equal_influence', 'squad_collaboration', 21, 'Alle fagområdene blir lyttet til og har reell påvirkning på løsningene.'),
  ('squad-health-v1', 'squad_share_and_help', 'squad_collaboration', 22, 'Vi deler kunnskap godt og hjelper hverandre når noen står fast.'),
  ('squad-health-v1', 'squad_one_team', 'squad_collaboration', 23, 'Vi jobber som ett team, ikke som separate fagavdelinger med felles Teams-chat.'),
  ('squad-health-v1', 'org_collaboration_works', 'organization_collaboration', 24, 'Samarbeidet med andre team, fagmiljøer og forretningen fungerer godt.'),
  ('squad-health-v1', 'org_get_help_early', 'organization_collaboration', 25, 'Vi får avklaringer og hjelp fra andre før saken rekker å bli en langtidsparkert veteranbil.'),
  ('squad-health-v1', 'org_clear_dependencies', 'organization_collaboration', 26, 'Roller, ansvar og avhengigheter mellom oss og andre team er tydelige.'),
  ('squad-health-v1', 'org_support_prioritized', 'organization_collaboration', 27, 'Når vi hjelper andre team, er oppdraget tydelig prioritert og planlagt.'),
  ('squad-health-v1', 'org_support_valuable', 'organization_collaboration', 28, 'Hjelp til andre team oppleves som verdifullt samarbeid, ikke bare tilfeldige avbrytelser.'),
  ('squad-health-v1', 'learning_regularly', 'learning_improvement', 29, 'Vi lærer regelmessig noe som gjør oss bedre som team eller fagpersoner.'),
  ('squad-health-v1', 'learning_act_on_problems', 'learning_improvement', 30, 'Når vi ser noe som ikke fungerer, klarer vi faktisk å gjøre noe med det.'),
  ('squad-health-v1', 'learning_use_insight', 'learning_improvement', 31, 'Vi bruker innsikt og data til å utfordre antakelser og forbedre løsningene våre.');

create function public.create_health_check_room(
  p_facilitator_user_id uuid,
  p_request_id uuid,
  p_facilitator_name text,
  p_squad_name text,
  p_measurement_date date,
  p_delivery_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  v_name text := btrim(p_facilitator_name);
  v_squad_name text := btrim(p_squad_name);
  v_session public.sessions%rowtype;
  v_health public.health_check_sessions%rowtype;
  v_participant public.participants%rowtype;
  v_join_code text;
  v_alphabet constant text := '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  v_attempt integer;
  v_constraint_name text;
begin
  if p_facilitator_user_id is null or not exists (
    select 1 from auth.users where id = p_facilitator_user_id
  ) then
    raise exception 'invalid_facilitator' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_facilitator_user_id::text, 0));

  select * into v_session
    from public.sessions
   where facilitator_user_id = p_facilitator_user_id
     and create_request_id = p_request_id
   limit 1;

  if found then
    if v_session.activity_type <> 'health_check' then
      return jsonb_build_object('status', 'active_session_exists');
    end if;

    select * into strict v_health
      from public.health_check_sessions where room_id = v_session.id;
    if v_session.status <> 'active' or v_health.expires_at <= clock_timestamp() then
      return jsonb_build_object('status', 'request_already_used');
    end if;
    select * into strict v_participant
      from public.participants
     where session_id = v_session.id
       and user_id = p_facilitator_user_id
       and role = 'facilitator';

    return jsonb_build_object(
      'status', 'ok',
      'session', jsonb_build_object(
        'id', v_session.id, 'activity_type', v_session.activity_type,
        'status', v_session.status, 'join_code', v_session.join_code,
        'created_at', v_session.created_at, 'phase', v_health.phase,
        'template_version', v_health.template_version,
        'squad_name', v_health.squad_name,
        'measurement_date', v_health.measurement_date,
        'expires_at', v_health.expires_at
      ),
      'participant', to_jsonb(v_participant) - 'user_id'
    );
  end if;

  select * into v_session
    from public.sessions
   where facilitator_user_id = p_facilitator_user_id
     and status = 'active'
   order by created_at desc
   limit 1;
  if found then
    return jsonb_build_object('status', 'active_session_exists');
  end if;

  if p_request_id is null then
    raise exception 'request_id_required' using errcode = '22023';
  end if;
  if v_name is null or char_length(v_name) < 1 or char_length(v_name) > 80 then
    raise exception 'invalid_name' using errcode = '22023';
  end if;
  if v_squad_name is null or char_length(v_squad_name) not between 1 and 80
     or v_squad_name ~ '[[:cntrl:]]' then
    raise exception 'invalid_squad_name' using errcode = '22023';
  end if;
  if p_measurement_date is null then
    raise exception 'measurement_date_required' using errcode = '22023';
  end if;
  if p_delivery_id is null then
    raise exception 'delivery_id_required' using errcode = '22023';
  end if;

  for v_attempt in 1..32 loop
    v_join_code := '';
    for v_position in 1..4 loop
      v_join_code := v_join_code || substr(
        v_alphabet,
        1 + (get_byte(uuid_send(gen_random_uuid()), v_position - 1) % char_length(v_alphabet)),
        1
      );
    end loop;
    begin
      insert into public.sessions (
        status, current_round, join_code, votes_revealed, started,
        consensus_streak, facilitator_user_id, create_request_id, activity_type
      ) values (
        'active', 1, v_join_code, false, false, 0,
        p_facilitator_user_id, p_request_id, 'health_check'
      ) returning * into v_session;
      exit;
    exception when unique_violation then
      get stacked diagnostics v_constraint_name = constraint_name;
      if v_constraint_name <> 'sessions_join_code_key' then
        raise;
      end if;
      if v_attempt = 32 then
        raise exception 'join_code_generation_exhausted';
      end if;
    end;
  end loop;

  insert into public.participants (session_id, name, role, user_id)
  values (v_session.id, v_name, 'facilitator', p_facilitator_user_id)
  returning * into v_participant;

  insert into public.health_check_sessions (
    room_id, delivery_id, template_version, squad_name, measurement_date, expires_at
  ) values (
    v_session.id, p_delivery_id, 'squad-health-v1', v_squad_name,
    p_measurement_date, clock_timestamp() + interval '23 hours 55 minutes'
  ) returning * into v_health;

  return jsonb_build_object(
    'status', 'ok',
    'session', jsonb_build_object(
      'id', v_session.id, 'activity_type', v_session.activity_type,
      'status', v_session.status, 'join_code', v_session.join_code,
      'created_at', v_session.created_at, 'phase', v_health.phase,
      'template_version', v_health.template_version,
      'squad_name', v_health.squad_name,
      'measurement_date', v_health.measurement_date,
      'expires_at', v_health.expires_at
    ),
    'participant', to_jsonb(v_participant) - 'user_id'
  );
end;
$function$;

create function public.join_health_check_room(
  p_user_id uuid,
  p_join_code text,
  p_name text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  v_code text := upper(btrim(p_join_code));
  v_name text := btrim(p_name);
  v_session public.sessions%rowtype;
  v_participant public.participants%rowtype;
  v_health public.health_check_sessions%rowtype;
begin
  if p_user_id is null or not exists (select 1 from auth.users where id = p_user_id) then
    raise exception 'invalid_user' using errcode = '22023';
  end if;
  if v_name is null or char_length(v_name) < 1 or char_length(v_name) > 80 then
    raise exception 'invalid_name' using errcode = '22023';
  end if;
  if v_code is null or char_length(v_code) <> 4 then
    return jsonb_build_object('status', 'session_not_found');
  end if;

  select s.* into v_session
    from public.sessions s
    join public.health_check_sessions h on h.room_id = s.id
   where s.join_code = v_code
      and s.status = 'active'
      and s.activity_type = 'health_check'
      and h.phase = 'lobby'
   for update of s;

  if not found then
    return jsonb_build_object('status', 'session_not_found');
  end if;
  select * into strict v_health
    from public.health_check_sessions where room_id = v_session.id;
  if v_health.expires_at <= clock_timestamp() then
    return jsonb_build_object('status', 'session_not_found');
  end if;
  if v_session.facilitator_user_id = p_user_id or exists (
    select 1 from public.participants p
     where p.session_id = v_session.id and p.user_id = p_user_id
       and p.role = 'facilitator'
  ) then
    return jsonb_build_object('status', 'role_conflict');
  end if;

  insert into public.participants (session_id, name, role, user_id, left_at)
  values (v_session.id, v_name, 'participant', p_user_id, null)
  on conflict (session_id, user_id) where user_id is not null
  do update set name = excluded.name, left_at = null
  returning * into v_participant;

  return jsonb_build_object(
    'status', 'ok',
    'session', to_jsonb(v_session) - 'facilitator_user_id' - 'create_request_id',
    'participant', to_jsonb(v_participant) - 'user_id'
  );
end;
$function$;

create or replace function public.join_session(p_join_code text, p_name text)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  v_user_id uuid := auth.uid();
  v_code text := upper(btrim(p_join_code));
  v_name text := btrim(p_name);
  v_session public.sessions%rowtype;
  v_participant public.participants%rowtype;
  v_round_participant public.round_participants%rowtype;
begin
  if v_user_id is null then
    raise exception 'authentication_required' using errcode = '28000';
  end if;
  if v_name is null or char_length(v_name) < 1 or char_length(v_name) > 80 then
    raise exception 'invalid_name' using errcode = '22023';
  end if;
  if v_code is null or char_length(v_code) <> 4 then
    return jsonb_build_object('status', 'session_not_found');
  end if;

  select s.* into v_session
    from public.sessions s
   where s.join_code = v_code
     and s.status = 'active'
     and s.activity_type = 'estimation'
     and s.facilitator_user_id is distinct from v_user_id
     and not exists (
       select 1 from public.participants p
        where p.session_id = s.id and p.user_id = v_user_id and p.role = 'facilitator'
     )
   for update;

  if not found then
    if exists (
      select 1 from public.sessions s
       where s.join_code = v_code
         and s.status = 'active'
         and s.activity_type = 'estimation'
         and (
           s.facilitator_user_id = v_user_id
           or exists (
             select 1 from public.participants p
              where p.session_id = s.id and p.user_id = v_user_id and p.role = 'facilitator'
           )
         )
    ) then
      return jsonb_build_object('status', 'role_conflict');
    end if;
    return jsonb_build_object('status', 'session_not_found');
  end if;

  insert into public.participants (session_id, name, role, user_id, left_at)
  values (v_session.id, v_name, 'participant', v_user_id, null)
  on conflict (session_id, user_id) where user_id is not null
  do update set name = excluded.name, left_at = null
  returning * into v_participant;

  if v_session.started and not v_session.votes_revealed then
    insert into public.round_participants (session_id, round, participant_id)
    values (v_session.id, v_session.current_round, v_participant.id)
    on conflict do nothing;
  end if;

  select * into v_round_participant
    from public.round_participants
   where session_id = v_session.id
     and round = v_session.current_round
     and participant_id = v_participant.id;

  return jsonb_build_object(
    'status', 'ok',
    'session', to_jsonb(v_session) - 'facilitator_user_id' - 'create_request_id',
    'participant', to_jsonb(v_participant) - 'user_id',
    'round_participant', to_jsonb(v_round_participant)
  );
end;
$function$;

create or replace function public.leave_session(p_session_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  v_user_id uuid := auth.uid();
  v_session public.sessions%rowtype;
  v_participant public.participants%rowtype;
  v_health_phase text;
  v_health_expires_at timestamptz;
begin
  if v_user_id is null then
    raise exception 'authentication_required' using errcode = '28000';
  end if;

  select s.* into v_session
    from public.sessions s
   where s.id = p_session_id
      and (
        s.activity_type = 'estimation'
        or exists (select 1 from public.health_check_sessions h where h.room_id = s.id)
     )
     and exists (
       select 1 from public.participants p
        where p.session_id = s.id
          and p.user_id = v_user_id
          and p.left_at is null
          and p.role <> 'facilitator'
     )
   for update;

  if not found then
    if exists (
      select 1 from public.participants p
       where p.session_id = p_session_id
         and p.user_id = v_user_id
         and p.left_at is null
         and p.role = 'facilitator'
         and exists (
           select 1 from public.sessions s
            where s.id = p.session_id
              and (
                s.activity_type = 'estimation'
                or exists (
                  select 1 from public.health_check_sessions h
                    where h.room_id = s.id and h.expires_at > clock_timestamp()
                )
              )
         )
    ) then
      raise exception 'facilitator_cannot_leave' using errcode = '42501';
    end if;
    return jsonb_build_object('status', 'membership_missing');
  end if;

  if v_session.activity_type = 'health_check' then
    select phase, expires_at into strict v_health_phase, v_health_expires_at
      from public.health_check_sessions where room_id = p_session_id;
    if v_health_expires_at <= clock_timestamp() then
      return jsonb_build_object('status', 'membership_missing');
    end if;
    if v_health_phase <> 'lobby' then
      raise exception 'health_check_leave_locked' using errcode = '42501';
    end if;
  end if;

  select * into strict v_participant
    from public.participants
   where session_id = p_session_id and user_id = v_user_id and left_at is null;

  update public.participants set left_at = now() where id = v_participant.id;

  if v_session.activity_type = 'estimation' then
    delete from public.round_participants rp
     where rp.session_id = p_session_id
       and rp.round = v_session.current_round
       and rp.participant_id = v_participant.id
       and not exists (
         select 1 from public.votes v
          where v.session_id = rp.session_id
            and v.round = rp.round
            and v.participant_id = rp.participant_id
       );
  end if;
  return jsonb_build_object('status', 'ok');
end;
$function$;

create or replace function public.restore_session(p_session_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  v_user_id uuid := auth.uid();
  v_session public.sessions%rowtype;
  v_participant public.participants%rowtype;
  v_vote public.votes%rowtype;
  v_round_participant public.round_participants%rowtype;
begin
  if v_user_id is null then
    raise exception 'authentication_required' using errcode = '28000';
  end if;
  if p_session_id is null then
    return jsonb_build_object('status', 'membership_missing');
  end if;

  select p.* into v_participant
    from public.participants p
    join public.sessions s on s.id = p.session_id
   where p.session_id = p_session_id
     and p.user_id = v_user_id
     and p.left_at is null
     and (
       s.activity_type = 'estimation'
       or exists (
         select 1 from public.health_check_sessions h
           where h.room_id = s.id and h.expires_at > clock_timestamp()
       )
     );
  if not found then
    return jsonb_build_object('status', 'membership_missing');
  end if;

  select * into strict v_session from public.sessions where id = p_session_id;
  if v_session.activity_type = 'estimation' then
    select * into v_vote from public.votes
     where session_id = p_session_id and round = v_session.current_round
       and participant_id = v_participant.id;
    select * into v_round_participant from public.round_participants
     where session_id = p_session_id and round = v_session.current_round
       and participant_id = v_participant.id;
  end if;

  return jsonb_build_object(
    'status', case
      when v_session.activity_type = 'estimation' and v_session.status = 'completed'
        then 'session_completed'
      else 'ok'
    end,
    'session', to_jsonb(v_session) - 'facilitator_user_id' - 'create_request_id',
    'participant', to_jsonb(v_participant) - 'user_id',
    'vote', to_jsonb(v_vote),
    'round_participant', to_jsonb(v_round_participant)
  );
end;
$function$;

create function public.get_health_check_state(p_room_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  v_user_id uuid := auth.uid();
  v_session public.sessions%rowtype;
  v_participant public.participants%rowtype;
  v_result jsonb;
begin
  if v_user_id is null then
    raise exception 'authentication_required' using errcode = '28000';
  end if;

  select s.* into v_session
    from public.sessions s
   where s.id = p_room_id
     and exists (
       select 1 from public.health_check_sessions h
         where h.room_id = s.id and h.expires_at > clock_timestamp()
     )
     and exists (
       select 1 from public.participants p
        where p.session_id = s.id and p.user_id = v_user_id and p.left_at is null
     );
  if not found then
    raise exception 'membership_required' using errcode = '42501';
  end if;
  if v_session.activity_type <> 'health_check' then
    raise exception 'wrong_activity_type' using errcode = '22023';
  end if;
  select p.* into strict v_participant
    from public.participants p
   where p.session_id = p_room_id and p.user_id = v_user_id and p.left_at is null;

  select jsonb_build_object(
    'phase', h.phase,
    'template_version', h.template_version,
    'squad_name', h.squad_name,
    'measurement_date', h.measurement_date,
    'respondent_state', r.state,
    'role', p.role
  ) into v_result
    from public.sessions s
    join public.health_check_sessions h on h.room_id = s.id
    join public.participants p on p.id = v_participant.id and p.session_id = s.id
    left join public.health_check_respondents r
      on r.room_id = s.id and r.member_id = p.id
   where s.id = p_room_id;

  return v_result;
end;
$function$;

create function public.start_health_check(p_room_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  v_user_id uuid := auth.uid();
  v_session public.sessions%rowtype;
  v_health public.health_check_sessions%rowtype;
  v_cohort_count integer;
  v_inserted integer;
begin
  if v_user_id is null then
    raise exception 'authentication_required' using errcode = '28000';
  end if;
  select s.* into v_session
    from public.sessions s
   where s.id = p_room_id
      and s.facilitator_user_id = v_user_id
      and exists (
       select 1 from public.participants p
        where p.session_id = s.id and p.user_id = v_user_id
          and p.left_at is null and p.role = 'facilitator'
     )
   for update;
  if not found then
    raise exception 'facilitator_required' using errcode = '42501';
  end if;
  if v_session.activity_type <> 'health_check' then
    raise exception 'wrong_activity_type' using errcode = '22023';
  end if;
  select * into strict v_health from public.health_check_sessions where room_id = p_room_id;
  if v_health.expires_at <= clock_timestamp() then
    raise exception 'facilitator_required' using errcode = '42501';
  end if;
  if v_health.phase <> 'lobby' or v_session.status <> 'active' then
    raise exception 'health_check_not_in_lobby' using errcode = '22023';
  end if;

  select count(*) into v_cohort_count
    from public.participants
   where session_id = p_room_id and role = 'participant' and left_at is null;
  if v_cohort_count < 5 then
    raise exception 'health_check_minimum_participants' using errcode = '22023';
  end if;

  insert into public.health_check_respondents (room_id, member_id)
  select p_room_id, id from public.participants
   where session_id = p_room_id and role = 'participant' and left_at is null;
  get diagnostics v_inserted = row_count;
  if v_inserted <> v_cohort_count then
    raise exception 'health_check_cohort_invariant';
  end if;

  insert into public.health_check_question_aggregates (
    room_id, template_version, question_key
  )
  select p_room_id, q.template_version, q.question_key
    from public.health_check_questions q
   where q.template_version = v_health.template_version
   order by q.sequence;
  get diagnostics v_inserted = row_count;
  if v_inserted <> 31 then
    raise exception 'health_check_template_invariant';
  end if;

  update public.health_check_sessions
     set phase = 'collecting', opened_at = statement_timestamp()
   where room_id = p_room_id
   returning * into v_health;
  update public.sessions set started = true where id = p_room_id;
  return jsonb_build_object(
    'status', 'ok', 'phase', v_health.phase,
    'template_version', v_health.template_version
  );
end;
$function$;

create function public.submit_health_check(p_room_id uuid, p_scores smallint[])
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  v_user_id uuid := auth.uid();
  v_session public.sessions%rowtype;
  v_health public.health_check_sessions%rowtype;
  v_participant public.participants%rowtype;
  v_respondent public.health_check_respondents%rowtype;
  v_updated integer;
begin
  if v_user_id is null then
    raise exception 'authentication_required' using errcode = '28000';
  end if;
  select s.* into v_session
    from public.sessions s
   where s.id = p_room_id
      and exists (
       select 1 from public.participants p
        where p.session_id = s.id and p.user_id = v_user_id
          and p.left_at is null and p.role = 'participant'
     )
   for update;
  if not found then
    raise exception 'respondent_required' using errcode = '42501';
  end if;
  if v_session.activity_type <> 'health_check' then
    raise exception 'wrong_activity_type' using errcode = '22023';
  end if;
  select * into strict v_health from public.health_check_sessions where room_id = p_room_id;
  if v_health.expires_at <= clock_timestamp() then
    raise exception 'respondent_required' using errcode = '42501';
  end if;
  if v_health.phase <> 'collecting' or v_session.status <> 'active' then
    raise exception 'health_check_not_collecting' using errcode = '22023';
  end if;
  select * into strict v_participant from public.participants
   where session_id = p_room_id and user_id = v_user_id
     and left_at is null and role = 'participant';
  select * into v_respondent from public.health_check_respondents
   where room_id = p_room_id and member_id = v_participant.id;
  if not found then
    raise exception 'respondent_required' using errcode = '42501';
  end if;
  if v_respondent.state = 'completed' then
    raise exception 'already_completed' using errcode = '22023';
  end if;
  if p_scores is null or cardinality(p_scores) <> 31
     or exists (select 1 from unnest(p_scores) score where score is null or score not between 1 and 7) then
    raise exception 'invalid_health_check_scores' using errcode = '22023';
  end if;

  with submitted as (
    select ordinality::smallint as sequence, score::bigint as score
      from unnest(p_scores) with ordinality as submitted(score, ordinality)
  ), increments as (
    select q.question_key, submitted.score
      from submitted
      join public.health_check_questions q
        on q.template_version = v_health.template_version
       and q.sequence = submitted.sequence
  )
  update public.health_check_question_aggregates a
     set score_sum = a.score_sum + increments.score,
         response_count = a.response_count + 1
    from increments
   where a.room_id = p_room_id
     and a.template_version = v_health.template_version
     and a.question_key = increments.question_key;
  get diagnostics v_updated = row_count;
  if v_updated <> 31 then
    raise exception 'health_check_aggregate_invariant';
  end if;

  update public.health_check_respondents
     set state = 'completed'
   where room_id = p_room_id and member_id = v_participant.id and state = 'in_progress';
  if not found then
    raise exception 'already_completed' using errcode = '22023';
  end if;
  return jsonb_build_object('status', 'completed');
end;
$function$;

create function public.get_health_check_progress(p_room_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  v_user_id uuid := auth.uid();
  v_result jsonb;
begin
  if v_user_id is null then
    raise exception 'authentication_required' using errcode = '28000';
  end if;
  if not exists (
    select 1 from public.sessions s
    join public.participants p on p.session_id = s.id
     and p.user_id = v_user_id and p.left_at is null and p.role = 'facilitator'
   where s.id = p_room_id and s.facilitator_user_id = v_user_id
     and exists (
       select 1 from public.health_check_sessions h
         where h.room_id = s.id and h.expires_at > clock_timestamp()
     )
  ) then
    raise exception 'facilitator_required' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.sessions where id = p_room_id and activity_type = 'health_check'
  ) then
    raise exception 'wrong_activity_type' using errcode = '22023';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'member_id', r.member_id, 'display_name', p.name, 'status', r.state
  ) order by lower(p.name), p.joined_at, p.id), '[]'::jsonb)
    into v_result
    from public.health_check_respondents r
    join public.participants p
      on p.session_id = r.room_id and p.id = r.member_id
   where r.room_id = p_room_id;
  return v_result;
end;
$function$;

create function public.remove_health_check_respondent(p_room_id uuid, p_member_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  v_user_id uuid := auth.uid();
  v_session public.sessions%rowtype;
  v_health public.health_check_sessions%rowtype;
  v_state text;
begin
  if v_user_id is null then
    raise exception 'authentication_required' using errcode = '28000';
  end if;
  select s.* into v_session
    from public.sessions s
   where s.id = p_room_id and s.facilitator_user_id = v_user_id
      and exists (
       select 1 from public.participants p where p.session_id = s.id
        and p.user_id = v_user_id and p.left_at is null and p.role = 'facilitator'
     )
   for update;
  if not found then
    raise exception 'facilitator_required' using errcode = '42501';
  end if;
  if v_session.activity_type <> 'health_check' then
    raise exception 'wrong_activity_type' using errcode = '22023';
  end if;
  select * into strict v_health from public.health_check_sessions where room_id = p_room_id;
  if v_health.expires_at <= clock_timestamp() then
    raise exception 'facilitator_required' using errcode = '42501';
  end if;
  if v_health.phase = 'download_pending' then
    raise exception 'health_check_removal_locked' using errcode = '22023';
  end if;

  if v_health.phase = 'collecting' then
    select state into v_state from public.health_check_respondents
     where room_id = p_room_id and member_id = p_member_id;
    if not found then
      raise exception 'respondent_not_found' using errcode = '22023';
    end if;
    if v_state = 'completed' then
      raise exception 'completed_respondent_locked' using errcode = '22023';
    end if;
    delete from public.health_check_respondents
     where room_id = p_room_id and member_id = p_member_id and state = 'in_progress';
  end if;

  update public.participants set left_at = statement_timestamp()
   where session_id = p_room_id and id = p_member_id
     and role = 'participant' and left_at is null;
  if not found then
    raise exception 'respondent_not_found' using errcode = '22023';
  end if;
  return jsonb_build_object('status', 'removed');
end;
$function$;

create function public.abort_health_check(p_room_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  v_user_id uuid := auth.uid();
  v_session public.sessions%rowtype;
  v_phase text;
  v_expires_at timestamptz;
begin
  if v_user_id is null then
    raise exception 'authentication_required' using errcode = '28000';
  end if;

  select s.* into v_session from public.sessions s
   where s.id = p_room_id and s.facilitator_user_id = v_user_id
      and exists (
       select 1 from public.participants p where p.session_id = s.id
        and p.user_id = v_user_id and p.left_at is null and p.role = 'facilitator'
     )
   for update;
  if not found then
    raise exception 'facilitator_required' using errcode = '42501';
  end if;
  if v_session.activity_type <> 'health_check' then
    raise exception 'wrong_activity_type' using errcode = '22023';
  end if;
  select phase, expires_at into strict v_phase, v_expires_at
    from public.health_check_sessions where room_id = p_room_id;
  if v_expires_at <= clock_timestamp() then
    raise exception 'facilitator_required' using errcode = '42501';
  end if;
  if v_phase = 'download_pending' then
    raise exception 'health_check_abort_locked' using errcode = '22023';
  end if;
  delete from public.sessions where id = p_room_id;
  return jsonb_build_object('status', 'aborted');
end;
$function$;

create function public.finalize_health_check(p_room_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  v_user_id uuid := auth.uid();
  v_session public.sessions%rowtype;
  v_health public.health_check_sessions%rowtype;
  v_cohort_count integer;
  v_completed_count integer;
  v_aggregate_count integer;
  v_min_count integer;
  v_max_count integer;
  v_job public.health_check_report_jobs%rowtype;
  v_finalize_required boolean := true;
  v_checked_at timestamptz;
begin
  if v_user_id is null then
    raise exception 'authentication_required' using errcode = '28000';
  end if;

  select * into v_job
    from public.health_check_report_jobs
   where aad_room_id = p_room_id
     and facilitator_user_id = v_user_id
     and status in ('awaiting_materialization', 'processing', 'ready', 'failed')
   order by created_at desc
   limit 1;
  if found then
    return jsonb_build_object(
      'status', 'download_pending', 'job_id', v_job.id,
      'job_status', case
        when v_job.expires_at <= clock_timestamp() then 'expired'
        else v_job.status
      end,
      'expires_at', v_job.expires_at
    );
  end if;

  select s.* into v_session from public.sessions s
   where s.id = p_room_id and s.facilitator_user_id = v_user_id
      and exists (
       select 1 from public.participants p where p.session_id = s.id
        and p.user_id = v_user_id and p.left_at is null and p.role = 'facilitator'
     )
   for update;
  if not found then
    raise exception 'facilitator_required' using errcode = '42501';
  end if;
  if v_session.activity_type <> 'health_check' then
    raise exception 'wrong_activity_type' using errcode = '22023';
  end if;
  select * into strict v_health from public.health_check_sessions where room_id = p_room_id;
  v_checked_at := clock_timestamp();
  if v_health.expires_at <= v_checked_at then
    raise exception 'facilitator_required' using errcode = '42501';
  end if;
  if v_health.phase = 'download_pending' then
    v_finalize_required := false;
  end if;
  if v_finalize_required
     and (v_health.phase <> 'collecting' or v_session.status <> 'active') then
    raise exception 'health_check_not_collecting' using errcode = '22023';
  end if;

  if v_finalize_required then
    select count(*), count(*) filter (where state = 'completed')
      into v_cohort_count, v_completed_count
      from public.health_check_respondents where room_id = p_room_id;
    if v_cohort_count < 5 then
      raise exception 'health_check_minimum_participants' using errcode = '22023';
    end if;
    if v_completed_count <> v_cohort_count then
      raise exception 'health_check_incomplete' using errcode = '22023';
    end if;

    select count(*), min(response_count), max(response_count)
      into v_aggregate_count, v_min_count, v_max_count
      from public.health_check_question_aggregates
     where room_id = p_room_id and template_version = v_health.template_version;
    if v_aggregate_count <> 31
       or v_min_count <> v_cohort_count or v_max_count <> v_cohort_count
       or exists (
         select 1 from public.health_check_question_aggregates
          where room_id = p_room_id
            and (score_sum < response_count or score_sum > response_count::bigint * 7)
       ) then
      raise exception 'health_check_aggregate_invariant';
    end if;

    insert into public.health_check_report_jobs (
      id, source_room_id, facilitator_user_id, aad_room_id,
      status, next_attempt_at, expires_at, idempotency_key
    ) values (
      v_health.delivery_id, p_room_id, v_user_id, p_room_id,
      'awaiting_materialization',
      v_checked_at, v_health.expires_at,
      'health-check:' || v_health.delivery_id::text
    ) on conflict do nothing;
  end if;

  select * into v_job
    from public.health_check_report_jobs
   where id = v_health.delivery_id;
  if not found
     or v_job.id is distinct from v_health.delivery_id
     or v_job.source_room_id is distinct from p_room_id
     or v_job.aad_room_id is distinct from p_room_id
     or v_job.facilitator_user_id is distinct from v_user_id
     or v_job.expires_at is distinct from v_health.expires_at
     or v_job.idempotency_key is distinct from 'health-check:' || v_health.delivery_id::text
     or v_job.status not in ('awaiting_materialization', 'processing', 'ready', 'failed') then
    raise exception 'health_check_report_job_invariant';
  end if;

  if v_finalize_required then
    update public.health_check_sessions set phase = 'download_pending' where room_id = p_room_id;
    update public.sessions set status = 'completed' where id = p_room_id;
  end if;
  return jsonb_build_object(
    'status', 'download_pending', 'job_id', v_health.delivery_id,
    'job_status', v_job.status, 'expires_at', v_job.expires_at
  );
end;
$function$;

create function public.get_health_check_download_status(p_job_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  v_user_id uuid := auth.uid();
  v_job public.health_check_report_jobs%rowtype;
begin
  if v_user_id is null then
    raise exception 'authentication_required' using errcode = '28000';
  end if;
  select * into v_job from public.health_check_report_jobs
   where id = p_job_id and facilitator_user_id = v_user_id;
  if not found then
    raise exception 'download_not_found' using errcode = '42501';
  end if;
  if v_job.expires_at <= clock_timestamp() then
    return jsonb_build_object(
      'status', 'expired', 'filename', null, 'expires_at', v_job.expires_at
    );
  end if;
  return jsonb_build_object(
    'status', case
      when v_job.status = 'awaiting_materialization' then 'awaiting_materialization'
      else v_job.status
    end,
    'filename', case when v_job.status = 'ready' then v_job.sanitized_filename else null end,
    'expires_at', v_job.expires_at
  );
end;
$function$;

create function private.materialize_health_check_download(
  p_job_id uuid,
  p_worker_id text,
  p_encrypted_package bytea,
  p_nonce bytea,
  p_key_version integer,
  p_filename text
)
returns void
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  v_job public.health_check_report_jobs%rowtype;
  v_checked_at timestamptz;
  v_source_expires_at timestamptz;
begin
  select * into v_job from public.health_check_report_jobs
   where id = p_job_id for update;
  v_checked_at := clock_timestamp();
  if p_worker_id is null or btrim(p_worker_id) = ''
     or not found or v_job.status <> 'processing'
     or v_job.claimed_by <> btrim(p_worker_id)
     or v_job.claimed_by is null or v_job.lease_expires_at <= v_checked_at then
    raise exception 'health_check_report_job_not_claimed' using errcode = '55000';
  end if;

  select h.expires_at into v_source_expires_at
    from public.health_check_sessions h
   where h.room_id = v_job.source_room_id
   for update;
  v_checked_at := clock_timestamp();
  if v_job.status <> 'processing'
     or v_job.claimed_by <> btrim(p_worker_id)
     or v_job.lease_expires_at <= v_checked_at then
    raise exception 'health_check_report_job_not_claimed' using errcode = '55000';
  end if;
  if v_job.expires_at <= v_checked_at
     or v_source_expires_at is null
     or v_source_expires_at <= v_checked_at then
    raise exception 'job_expired' using errcode = '55000';
  end if;

  if p_encrypted_package is null or octet_length(p_encrypted_package) = 0
     or p_nonce is null or octet_length(p_nonce) <> 12
     or p_key_version is null or p_key_version <= 0
     or p_filename is null or p_filename <> btrim(p_filename)
     or char_length(p_filename) not between 5 and 180
     or p_filename ~ '[[:cntrl:]/\\]'
     or right(lower(p_filename), 4) <> '.zip' then
    raise exception 'invalid_health_check_download_package' using errcode = '22023';
  end if;

  v_checked_at := clock_timestamp();
  if v_job.lease_expires_at <= v_checked_at then
    raise exception 'health_check_report_job_not_claimed' using errcode = '55000';
  end if;
  if v_job.expires_at <= v_checked_at
     or v_source_expires_at <= v_checked_at then
    raise exception 'job_expired' using errcode = '55000';
  end if;

  update public.health_check_report_jobs set
    source_room_id = null,
    encrypted_package = p_encrypted_package,
    package_nonce = p_nonce,
    encryption_key_version = p_key_version,
    sanitized_filename = p_filename,
    status = 'ready',
    claimed_by = null,
    lease_expires_at = null,
    materialized_at = v_checked_at,
    expires_at = least(v_checked_at + interval '15 minutes', v_source_expires_at)
  where id = p_job_id
    and status = 'processing'
    and claimed_by = btrim(p_worker_id)
    and lease_expires_at > v_checked_at
    and expires_at > v_checked_at;
  if not found then
    raise exception 'health_check_report_job_not_claimed' using errcode = '55000';
  end if;

  delete from public.sessions where id = v_job.source_room_id;
  if not found then
    raise exception 'health_check_source_room_missing' using errcode = '55000';
  end if;
end;
$function$;

create function private.claim_health_check_report_job(
  p_job_id uuid,
  p_worker_id text,
  p_lease interval
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  v_job public.health_check_report_jobs%rowtype;
  v_checked_at timestamptz;
begin
  if p_worker_id is null or btrim(p_worker_id) = ''
     or p_lease is null or p_lease <= interval '0 seconds'
     or p_lease > interval '5 minutes' then
    raise exception 'invalid_health_check_report_claim' using errcode = '22023';
  end if;
  select * into v_job from public.health_check_report_jobs
   where id = p_job_id for update;
  if not found then
    return false;
  end if;
  v_checked_at := clock_timestamp();
  if v_job.status not in ('awaiting_materialization', 'failed')
     or v_job.next_attempt_at > v_checked_at
     or v_job.expires_at <= v_checked_at then
    return false;
  end if;

  update public.health_check_report_jobs set
    status = 'processing', attempts = attempts + 1,
    claimed_by = btrim(p_worker_id),
    lease_expires_at = v_checked_at + p_lease
  where id = p_job_id;
  return true;
end;
$function$;

create function public.get_health_check_report_snapshot_for_service(
  p_job_id uuid,
  p_worker_id text
)
returns table (
  job_id uuid,
  aad_room_id uuid,
  squad_name text,
  measurement_date date,
  template_version text,
  expected_respondent_count integer,
  area_key text,
  area_sequence smallint,
  area_title text,
  area_introduction text,
  area_description text,
  question_key text,
  question_sequence smallint,
  question_text text,
  score_sum bigint,
  response_count integer
)
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  v_job public.health_check_report_jobs%rowtype;
  v_health public.health_check_sessions%rowtype;
  v_session public.sessions%rowtype;
  v_checked_at timestamptz;
  v_source_found boolean;
  v_session_found boolean;
  v_template_count integer;
  v_area_count integer;
  v_question_count integer;
  v_aggregate_count integer;
  v_joined_count integer;
  v_joined_area_count integer;
  v_min_response_count integer;
  v_max_response_count integer;
begin
  select j.* into v_job
    from public.health_check_report_jobs as j
   where j.id = p_job_id
   for update;
  v_checked_at := clock_timestamp();
  if p_worker_id is null or btrim(p_worker_id) = ''
     or not found
     or v_job.status <> 'processing'
     or v_job.claimed_by is null
     or v_job.claimed_by <> btrim(p_worker_id)
     or v_job.lease_expires_at is null
     or v_job.lease_expires_at <= v_checked_at
     or v_job.source_room_id is null then
    raise exception 'health_check_report_job_not_claimed' using errcode = '55000';
  end if;
  if v_job.expires_at <= v_checked_at then
    raise exception 'job_expired' using errcode = '55000';
  end if;

  select h.* into v_health
    from public.health_check_sessions as h
   where h.room_id = v_job.source_room_id
   for update;
  v_source_found := found;
  v_checked_at := clock_timestamp();
  if v_job.status <> 'processing'
     or v_job.claimed_by is null
     or v_job.claimed_by <> btrim(p_worker_id)
     or v_job.lease_expires_at is null
     or v_job.lease_expires_at <= v_checked_at then
    raise exception 'health_check_report_job_not_claimed' using errcode = '55000';
  end if;
  if v_job.expires_at <= v_checked_at
     or not v_source_found
     or v_health.expires_at <= v_checked_at then
    raise exception 'job_expired' using errcode = '55000';
  end if;

  select s.* into v_session
    from public.sessions as s
   where s.id = v_health.room_id
   for update;
  v_session_found := found;
  v_checked_at := clock_timestamp();
  if v_job.status <> 'processing'
     or v_job.claimed_by is null
     or v_job.claimed_by <> btrim(p_worker_id)
     or v_job.lease_expires_at is null
     or v_job.lease_expires_at <= v_checked_at then
    raise exception 'health_check_report_job_not_claimed' using errcode = '55000';
  end if;
  if v_job.expires_at <= v_checked_at
     or v_health.expires_at <= v_checked_at then
    raise exception 'job_expired' using errcode = '55000';
  end if;
  if not v_session_found
     or v_health.room_id is distinct from v_job.source_room_id
     or v_health.delivery_id is distinct from v_job.id
     or v_job.aad_room_id is distinct from v_health.room_id
     or v_job.expires_at is distinct from v_health.expires_at
     or v_health.phase <> 'download_pending'
     or v_session.activity_type <> 'health_check'
     or v_session.status <> 'completed'
     or v_session.facilitator_user_id is distinct from v_job.facilitator_user_id then
    raise exception 'health_check_report_snapshot_invariant' using errcode = '55000';
  end if;

  select count(*)::integer into v_template_count
    from public.health_check_templates as t
   where t.version = v_health.template_version
     and t.area_count = 7
     and t.question_count = 31;
  select count(*)::integer into v_area_count
    from public.health_check_areas as ar
   where ar.template_version = v_health.template_version;
  select count(*)::integer into v_question_count
    from public.health_check_questions as q
   where q.template_version = v_health.template_version;
  select count(*)::integer, min(a.response_count), max(a.response_count)
    into v_aggregate_count, v_min_response_count, v_max_response_count
    from public.health_check_question_aggregates as a
   where a.room_id = v_health.room_id;
  select count(*)::integer, count(distinct ar.area_key)::integer
    into v_joined_count, v_joined_area_count
    from public.health_check_question_aggregates as a
    join public.health_check_questions as q
      on q.template_version = a.template_version
     and q.question_key = a.question_key
    join public.health_check_areas as ar
      on ar.template_version = q.template_version
     and ar.area_key = q.area_key
   where a.room_id = v_health.room_id
     and a.template_version = v_health.template_version;

  if v_template_count <> 1
     or v_area_count <> 7
     or v_question_count <> 31
     or v_aggregate_count <> 31
     or v_joined_count <> 31
     or v_joined_area_count <> 7
     or v_min_response_count is null
     or v_min_response_count < 5
     or v_min_response_count <> v_max_response_count
     or exists (
       select 1
         from public.health_check_question_aggregates as a
        where a.room_id = v_health.room_id
          and (
            a.template_version is distinct from v_health.template_version
            or a.response_count is null
            or a.score_sum is null
            or a.score_sum < a.response_count
            or a.score_sum > a.response_count::bigint * 7
          )
     ) then
    raise exception 'health_check_report_snapshot_invariant' using errcode = '55000';
  end if;

  v_checked_at := clock_timestamp();
  if v_job.status <> 'processing'
     or v_job.claimed_by is null
     or v_job.claimed_by <> btrim(p_worker_id)
     or v_job.lease_expires_at is null
     or v_job.lease_expires_at <= v_checked_at then
    raise exception 'health_check_report_job_not_claimed' using errcode = '55000';
  end if;
  if v_job.expires_at <= v_checked_at
     or v_health.expires_at <= v_checked_at then
    raise exception 'job_expired' using errcode = '55000';
  end if;

  return query
  select v_job.id,
         v_job.aad_room_id,
         v_health.squad_name,
         v_health.measurement_date,
         v_health.template_version,
         v_min_response_count,
         ar.area_key,
         ar.sequence,
         ar.title,
         ar.introduction,
         ar.description,
         q.question_key,
         q.sequence,
         q.text,
         a.score_sum,
         a.response_count
    from public.health_check_question_aggregates as a
    join public.health_check_questions as q
      on q.template_version = a.template_version
     and q.question_key = a.question_key
    join public.health_check_areas as ar
      on ar.template_version = q.template_version
     and ar.area_key = q.area_key
   where a.room_id = v_health.room_id
     and a.template_version = v_health.template_version
   order by ar.sequence, q.sequence;
end;
$function$;

revoke all on function public.get_health_check_report_snapshot_for_service(uuid, text)
  from public, anon, authenticated, service_role;

create function private.fail_health_check_report_job(p_job_id uuid, p_worker_id text)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  v_job public.health_check_report_jobs%rowtype;
  v_checked_at timestamptz;
begin
  if p_worker_id is null or btrim(p_worker_id) = '' then
    raise exception 'invalid_health_check_report_worker' using errcode = '22023';
  end if;
  select * into v_job from public.health_check_report_jobs
   where id = p_job_id for update;
  if not found then
    return false;
  end if;
  v_checked_at := clock_timestamp();
  if v_job.status <> 'processing'
     or v_job.claimed_by <> btrim(p_worker_id)
     or v_job.expires_at <= v_checked_at then
    return false;
  end if;

  update public.health_check_report_jobs set
    status = 'failed', claimed_by = null, lease_expires_at = null,
    next_attempt_at = v_checked_at
  where id = p_job_id;
  return true;
end;
$function$;

create function private.get_health_check_download_package(p_job_id uuid, p_user_id uuid)
returns table (
  encrypted_package bytea,
  package_nonce bytea,
  encryption_key_version integer,
  sanitized_filename text,
  aad_room_id uuid
)
language sql
security definer
set search_path = pg_catalog
as $function$
  select j.encrypted_package, j.package_nonce, j.encryption_key_version,
         j.sanitized_filename, j.aad_room_id
    from public.health_check_report_jobs j
   where j.id = p_job_id
     and p_user_id is not null
     and j.facilitator_user_id = p_user_id
     and j.status = 'ready'
     and j.expires_at > clock_timestamp();
$function$;

revoke all on function private.get_health_check_download_package(uuid, uuid) from public, anon, authenticated, service_role;

create function public.get_health_check_download_package_for_service(
  p_job_id uuid,
  p_user_id uuid
)
returns table (
  encrypted_package bytea,
  package_nonce bytea,
  encryption_key_version integer,
  sanitized_filename text,
  aad_room_id uuid
)
language sql
security definer
set search_path = pg_catalog
as $function$
  select *
    from private.get_health_check_download_package(p_job_id, p_user_id);
$function$;

revoke all on function public.get_health_check_download_package_for_service(uuid, uuid)
  from public, anon, authenticated, service_role;

create function private.cleanup_expired_health_checks()
returns void
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  v_cleanup_at timestamptz := clock_timestamp();
begin
  delete from public.health_check_report_jobs
   where expires_at <= v_cleanup_at
      or exists (
        select 1 from public.health_check_sessions h
         where h.room_id = health_check_report_jobs.source_room_id
            and h.expires_at <= v_cleanup_at
      );

  update public.health_check_report_jobs
     set status = 'failed', claimed_by = null, lease_expires_at = null,
          next_attempt_at = v_cleanup_at
   where status = 'processing'
     and lease_expires_at <= v_cleanup_at
     and expires_at > v_cleanup_at;

  delete from public.sessions s
    using public.health_check_sessions h
    where h.room_id = s.id and h.expires_at <= v_cleanup_at;
end;
$function$;

revoke all on table public.health_check_templates from public, anon, authenticated, service_role;
revoke all on table public.health_check_areas from public, anon, authenticated, service_role;
revoke all on table public.health_check_questions from public, anon, authenticated, service_role;
revoke all on table public.health_check_sessions from public, anon, authenticated, service_role;
revoke all on table public.health_check_respondents from public, anon, authenticated, service_role;
revoke all on table public.health_check_question_aggregates from public, anon, authenticated, service_role;
revoke all on table public.health_check_report_jobs from public, anon, authenticated, service_role;

grant select (
  id, source_room_id, aad_room_id, status, attempts,
  next_attempt_at, claimed_by, lease_expires_at, materialized_at, expires_at,
  idempotency_key, created_at
) on table public.health_check_report_jobs to service_role;

revoke execute on function private.prevent_health_catalog_mutation() from public, anon, authenticated;
revoke execute on function private.validate_health_check_expiry() from public, anon, authenticated;
revoke execute on function private.validate_health_check_room_type() from public, anon, authenticated;
revoke execute on function private.prevent_health_check_room_type_change() from public, anon, authenticated;
revoke execute on function private.validate_health_report_job_state() from public, anon, authenticated, service_role;
revoke execute on function private.cleanup_expired_health_checks() from public, anon, authenticated;
revoke execute on function private.claim_health_check_report_job(uuid, text, interval) from public, anon, authenticated;
revoke execute on function private.fail_health_check_report_job(uuid, text) from public, anon, authenticated;
revoke execute on function private.materialize_health_check_download(uuid, text, bytea, bytea, integer, text) from public, anon, authenticated;
revoke execute on function private.get_health_check_download_package(uuid, uuid) from public, anon, authenticated;
revoke execute on function private.is_session_member(uuid) from public, anon, authenticated;
revoke execute on function private.can_access_presence_topic(text) from public, anon, authenticated;
revoke execute on function public.create_health_check_room(uuid, uuid, text, text, date, uuid) from public, anon, authenticated;
revoke execute on function public.join_health_check_room(uuid, text, text) from public, anon, authenticated;
revoke execute on function public.get_health_check_state(uuid) from public, anon;
revoke execute on function public.start_health_check(uuid) from public, anon;
revoke execute on function public.submit_health_check(uuid, smallint[]) from public, anon;
revoke execute on function public.get_health_check_progress(uuid) from public, anon;
revoke execute on function public.remove_health_check_respondent(uuid, uuid) from public, anon;
revoke execute on function public.abort_health_check(uuid) from public, anon;
revoke execute on function public.finalize_health_check(uuid) from public, anon;
revoke execute on function public.get_health_check_download_status(uuid) from public, anon;
revoke execute on function public.get_health_check_download_package_for_service(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.get_health_check_report_snapshot_for_service(uuid, text) from public, anon, authenticated;

grant execute on function private.cleanup_expired_health_checks() to service_role;
grant execute on function private.claim_health_check_report_job(uuid, text, interval) to service_role;
grant execute on function private.fail_health_check_report_job(uuid, text) to service_role;
grant execute on function private.materialize_health_check_download(uuid, text, bytea, bytea, integer, text) to service_role;
grant execute on function private.get_health_check_download_package(uuid, uuid) to service_role;
grant execute on function private.is_session_member(uuid) to authenticated;
grant execute on function private.can_access_presence_topic(text) to authenticated;
grant execute on function public.create_health_check_room(uuid, uuid, text, text, date, uuid) to service_role;
grant execute on function public.join_health_check_room(uuid, text, text) to service_role;
grant execute on function public.get_health_check_state(uuid) to authenticated;
grant execute on function public.start_health_check(uuid) to authenticated;
grant execute on function public.submit_health_check(uuid, smallint[]) to authenticated;
grant execute on function public.get_health_check_progress(uuid) to authenticated;
grant execute on function public.remove_health_check_respondent(uuid, uuid) to authenticated;
grant execute on function public.abort_health_check(uuid) to authenticated;
grant execute on function public.finalize_health_check(uuid) to authenticated;
grant execute on function public.get_health_check_download_status(uuid) to authenticated;
grant execute on function public.get_health_check_download_package_for_service(uuid, uuid) to service_role;
grant execute on function public.get_health_check_report_snapshot_for_service(uuid, text) to service_role;

-- Reassert the complete common RPC privilege contract after replacing these
-- definitions; function replacement preserves ACLs, but explicit grants make
-- the intended API reviewable in this migration.
revoke execute on function public.join_session(text, text) from public, anon;
revoke execute on function public.leave_session(uuid) from public, anon;
revoke execute on function public.restore_session(uuid) from public, anon;
grant execute on function public.join_session(text, text) to authenticated;
grant execute on function public.leave_session(uuid) to authenticated;
grant execute on function public.restore_session(uuid) to authenticated;
