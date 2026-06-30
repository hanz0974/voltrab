/*
# Create rab_reports table for saving final RAB data

## Purpose
Stores the final, completed RAB (Rencana Anggaran Biaya) reports — the full
project data including all floors, rooms, parts, and calculated totals —
separate from the auto-saved wizard progress in user_projects. This lets users
save a snapshot of a finished RAB that they can revisit later without it being
overwritten by ongoing wizard edits.

## New Tables
- `rab_reports`
  - `id` (uuid, primary key)
  - `user_id` (uuid, NOT NULL, defaults to auth.uid(), references auth.users ON DELETE CASCADE)
  - `project_name` (text, not null)
  - `client` (text, nullable)
  - `location` (text, nullable)
  - `project_date` (text, nullable)
  - `report_data` (jsonb, full serialized RAB: floors, rooms, parts, totals)
  - `grand_total` (bigint, total cost in IDR)
  - `total_items` (integer, total number of part items)
  - `total_qty` (integer, total quantity of all parts)
  - `updated_at` (timestamptz, auto-updated)
  - `created_at` (timestamptz, default now())

## Security
- RLS enabled on `rab_reports`.
- 4 owner-scoped policies (SELECT/INSERT/UPDATE/DELETE), each `TO authenticated`
  with `auth.uid() = user_id` ownership check.
- `user_id` defaults to `auth.uid()` so frontend inserts that omit user_id succeed.

## Notes
1. The frontend serializes the full RAB (project info + floors + rooms + parts
   + computed totals) into `report_data` as JSON.
2. `grand_total`, `total_items`, `total_qty` are stored as separate columns for
   quick listing/queries without parsing JSON.
3. Users can save multiple RAB reports and view them later.
*/

CREATE TABLE IF NOT EXISTS rab_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  project_name text NOT NULL DEFAULT 'Project Tanpa Nama',
  client text,
  location text,
  project_date text,
  report_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  grand_total bigint NOT NULL DEFAULT 0,
  total_items integer NOT NULL DEFAULT 0,
  total_qty integer NOT NULL DEFAULT 0,
  updated_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE rab_reports ENABLE ROW LEVEL SECURITY;

-- Auto-update updated_at on row change
DROP TRIGGER IF EXISTS trg_rab_reports_updated_at ON rab_reports;
CREATE TRIGGER trg_rab_reports_updated_at
  BEFORE UPDATE ON rab_reports
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Indexes
CREATE INDEX IF NOT EXISTS idx_rab_reports_user_id ON rab_reports(user_id);
CREATE INDEX IF NOT EXISTS idx_rab_reports_created_at ON rab_reports(created_at DESC);

-- RLS Policies (owner-scoped, authenticated only)
DROP POLICY IF EXISTS "select_own_rab_reports" ON rab_reports;
CREATE POLICY "select_own_rab_reports" ON rab_reports FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_rab_reports" ON rab_reports;
CREATE POLICY "insert_own_rab_reports" ON rab_reports FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_rab_reports" ON rab_reports;
CREATE POLICY "update_own_rab_reports" ON rab_reports FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_rab_reports" ON rab_reports;
CREATE POLICY "delete_own_rab_reports" ON rab_reports FOR DELETE
  TO authenticated USING (auth.uid() = user_id);
