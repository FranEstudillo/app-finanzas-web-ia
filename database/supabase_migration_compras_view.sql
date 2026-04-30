-- Run this in your Supabase SQL editor
create table if not exists planned_purchases (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid references auth.users(id) on delete cascade not null,
  credit_id     uuid references credits(id) on delete set null,
  credit_name   text not null,
  cut_date      date,
  pay_date      date,
  total_balance numeric(12,2) default 0,
  account_balance numeric(12,2) default 0,
  quincena_amounts jsonb default '{}',
  created_at    timestamptz default now()
);

-- Enable RLS
alter table planned_purchases enable row level security;

-- Policy: users can only see/edit their own rows
create policy "Users manage own planned purchases"
  on planned_purchases
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);