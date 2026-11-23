-- Pure Chess Academy: Supabase PostgreSQL Schema
-- Run this script in your Supabase Dashboard -> SQL Editor.

create extension if not exists pgcrypto;

-- 1. Academy Users (Admin & Invite-Only Students)
create table if not exists public.academy_users (
  id uuid primary key default gen_random_uuid(),
  login_id text unique not null,
  password_hash text not null,
  full_name text not null,
  role text not null check (role in ('admin', 'student')),
  session_approved boolean not null default false,
  pending_approval boolean not null default false,
  last_login_request timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_academy_users_login_id on public.academy_users (login_id);
create index if not exists idx_academy_users_role on public.academy_users (role);

-- 2. Custom Admin-Published Puzzles
create table if not exists public.custom_puzzles (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  fen text not null,
  solution_moves text not null,
  difficulty text not null default 'Intermediate',
  coach_notes text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists idx_custom_puzzles_created_at on public.custom_puzzles (created_at desc);

-- 3. Student Puzzle Progress & Attempts
create table if not exists public.student_progress (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.academy_users(id) on delete cascade,
  puzzle_id uuid not null references public.custom_puzzles(id) on delete cascade,
  solved boolean not null default false,
  attempts integer not null default 0,
  completed_at timestamptz,
  unique (user_id, puzzle_id)
);

create index if not exists idx_student_progress_user_id on public.student_progress (user_id);
create index if not exists idx_student_progress_puzzle_id on public.student_progress (puzzle_id);

-- 4. Recent Academy Games (Match History & Game Review)
create table if not exists public.academy_games (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.academy_users(id) on delete cascade,
  opponent_label text not null,
  time_control text not null default 'Untimed',
  player_color text not null check (player_color in ('w', 'b')),
  result text not null check (result in ('win', 'loss', 'draw')),
  result_reason text not null default '',
  initial_fen text not null,
  moves_san text not null default '',
  move_count integer not null default 0,
  played_at timestamptz not null default now()
);

create index if not exists idx_academy_games_user_id on public.academy_games (user_id, played_at desc);

-- 5. Live Student-to-Coach Messages
create table if not exists public.coach_messages (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.academy_users(id) on delete cascade,
  sender_id uuid not null references public.academy_users(id) on delete cascade,
  sender_role text not null check (sender_role in ('admin', 'student')),
  sender_name text not null,
  message_text text not null,
  attached_fen text,
  attached_context text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists idx_coach_messages_student_created
  on public.coach_messages (student_id, created_at asc);

-- Optional safe column upgrades for existing deployments
alter table public.academy_users
  add column if not exists chat_disabled boolean not null default false,
  add column if not exists presence_status text not null default 'offline',
  add column if not exists last_seen_at timestamptz;

-- 6. Student Friendships (Add Friend / Accept Request)
create table if not exists public.friendships (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references public.academy_users(id) on delete cascade,
  addressee_id uuid not null references public.academy_users(id) on delete cascade,
  status text not null check (status in ('pending', 'accepted', 'declined')) default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_friendships_users on public.friendships (requester_id, addressee_id);

-- 7. Social Messaging (Match Chat & Friends DM + Admin Moderation Flags)
create table if not exists public.social_messages (
  id uuid primary key default gen_random_uuid(),
  channel_type text not null check (channel_type in ('dm', 'match')),
  sender_id uuid not null references public.academy_users(id) on delete cascade,
  recipient_id uuid references public.academy_users(id) on delete cascade,
  match_room_id text,
  sender_name text not null,
  sender_login_id text not null,
  message_text text not null,
  flagged boolean not null default false,
  flag_reason text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists idx_social_messages_channel on public.social_messages (channel_type, created_at asc);
create index if not exists idx_social_messages_flagged on public.social_messages (flagged, created_at desc);

-- 8. Live Friend Match Challenges
create table if not exists public.match_challenges (
  id uuid primary key default gen_random_uuid(),
  challenger_id uuid not null references public.academy_users(id) on delete cascade,
  challenger_name text not null,
  challenger_login_id text not null,
  challenged_id uuid not null references public.academy_users(id) on delete cascade,
  challenged_name text not null,
  challenged_login_id text not null,
  time_control text not null default 'rapid10',
  status text not null check (status in ('pending', 'accepted', 'declined', 'completed')) default 'pending',
  moves_san text not null default '',
  resigned_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Lock down direct anonymous browser access; server.ts uses SUPABASE_SERVICE_ROLE_KEY
alter table public.academy_users enable row level security;
alter table public.custom_puzzles enable row level security;
alter table public.student_progress enable row level security;
alter table public.academy_games enable row level security;
alter table public.coach_messages enable row level security;
alter table public.friendships enable row level security;
alter table public.social_messages enable row level security;
alter table public.match_challenges enable row level security;

-- Enable Supabase Realtime on academy_users and coach_messages
do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'academy_users'
  ) then
    alter publication supabase_realtime add table public.academy_users;
  end if;
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'coach_messages'
  ) then
    alter publication supabase_realtime add table public.coach_messages;
  end if;
exception when others then
  null;
end $$;
