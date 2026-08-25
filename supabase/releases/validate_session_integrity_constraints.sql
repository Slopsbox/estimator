-- Run only after production preflight confirms there are no cross-session votes.
alter table public.votes validate constraint votes_session_participant_fkey;
