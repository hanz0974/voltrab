/*
# Create user_projects table for per-user RAB progress

## Purpose
Stores each user's VoltRAB wizard progress (project info, floors, rooms, parts)
so every authenticated user has their own saved projects. Each user can have
multiple saved projects and resume any of them.

## New Tables
- `user_projects`
  - `id` (uuid, primary key)
  - `user_id` (uuid, NOT NULL, defaults to auth.uid(), references auth.users with ON DELETE CASCADE)
  - `name` (text, project display name)
  - `project_data` (jsonb, full serialized wizard state)
  - `updated_at` (timestamptz, auto-updated on change)
  - `created_at` (timestamptz, default now())

## Security
- RLS enabled on `user_projects`.
- 4 owner-scoped policies (SELECT/INSERT/UPDATE/DELETE), each `TO authenticated`
  with `auth.uid() = user_id` ownership check.
- `user_id` defaults to `auth.uid()` so frontend inserts that omit user_id succeed.

## Notes
1. The frontend serializes the entire wizard state into `project_data` as JSON.
2. On login, the app loads the user's most recently updated project.
3. On any state change, the app upserts the current project data.
*/

-- Create the updated_at trigger function first (idempotent)
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $func$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$func$ LANGUAGE plpgsql;

CREATE TABLE IF NOT EXISTS user_projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL DEFAULT 'Project Tanpa Nama',
  project_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE user_projects ENABLE ROW LEVEL SECURITY;

-- Auto-update updated_at on row change
DROP TRIGGER IF EXISTS trg_user_projects_updated_at ON user_projects;
CREATE TRIGGER trg_user_projects_updated_at
  BEFORE UPDATE ON user_projects
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Indexes for fast per-user queries
CREATE INDEX IF NOT EXISTS idx_user_projects_user_id ON user_projects(user_id);
CREATE INDEX IF NOT EXISTS idx_user_projects_updated_at ON user_projects(updated_at DESC);

-- RLS Policies (owner-scoped, authenticated only)
DROP POLICY IF EXISTS "select_own_projects" ON user_projects;
CREATE POLICY "select_own_projects" ON user_projects FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_projects" ON user_projects;
CREATE POLICY "insert_own_projects" ON user_projects FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_projects" ON user_projects;
CREATE POLICY "update_own_projects" ON user_projects FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_projects" ON user_projects;
CREATE POLICY "delete_own_projects" ON user_projects FOR DELETE
  TO authenticated USING (auth.uid() = user_id);
