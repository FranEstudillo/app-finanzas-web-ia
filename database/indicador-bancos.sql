-- Run in Supabase SQL Editor
alter table accounts
  add column if not exists bank_name  text default '',
  add column if not exists bank_color text default '#6c63ff';
  