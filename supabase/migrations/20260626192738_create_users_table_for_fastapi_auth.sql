/*
# Create users table for FastAPI authentication

## Purpose
Stores user accounts for FastAPI-based authentication (separate from Supabase
Auth). Passwords are hashed with bcrypt on the FastAPI server side.

## New Tables
- `users`
  - `id` (uuid, primary key)
  - `email` (text, unique, not null)
  - `password_hash` (text, not null - bcrypt hash)
  - `created_at` (timestamptz, default now())

## Security
- RLS enabled on `users`.
- No policies needed for direct access — the FastAPI backend connects with
  the service role key which bypasses RLS. The frontend never touches this
  table directly; all auth goes through the FastAPI API.
- RLS is enabled as a defense-in-depth measure. No policies are added, which
  means the table is inaccessible via the anon key (locked down).

## Notes
1. The FastAPI backend uses the SUPABASE_DB_URL (direct Postgres connection)
   to read/write this table with full privileges.
2. Password hashing is done server-side with passlib/bcrypt.
3. JWT tokens are issued by FastAPI, not Supabase Auth.
*/

CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text UNIQUE NOT NULL,
  password_hash text NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- No policies: table is locked down for anon/authenticated.
-- FastAPI backend uses direct Postgres connection (service role) which bypasses RLS.

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
