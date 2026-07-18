/*
# Create detection_feedback_reports table

## Purpose
Stores user complaints when automatic SLD detection is not accurate.
Each report includes the complaint text and the detection image so admins
can review failed/incorrect detections from the admin dashboard.
*/

CREATE TABLE IF NOT EXISTS detection_feedback_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  reporter_email text,
  project_name text NOT NULL DEFAULT 'Project Tanpa Nama',
  floor_name text,
  room_name text,
  complaint text NOT NULL,
  detection_image text,
  detections jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'reviewed', 'resolved')),
  admin_note text,
  updated_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE detection_feedback_reports ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS trg_detection_feedback_reports_updated_at ON detection_feedback_reports;
CREATE TRIGGER trg_detection_feedback_reports_updated_at
  BEFORE UPDATE ON detection_feedback_reports
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_detection_feedback_reports_user_id ON detection_feedback_reports(user_id);
CREATE INDEX IF NOT EXISTS idx_detection_feedback_reports_status ON detection_feedback_reports(status);
CREATE INDEX IF NOT EXISTS idx_detection_feedback_reports_created_at ON detection_feedback_reports(created_at DESC);

CREATE OR REPLACE FUNCTION public.is_admin_actor()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    COALESCE(LOWER(auth.jwt() ->> 'email'), '') LIKE '%admin%'
    OR EXISTS (
      SELECT 1
      FROM public.users
      WHERE id = auth.uid()
        AND is_admin = TRUE
    );
$$;

REVOKE ALL ON FUNCTION public.is_admin_actor() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_admin_actor() TO authenticated;

DROP POLICY IF EXISTS "select_own_detection_feedback_reports" ON detection_feedback_reports;
CREATE POLICY "select_own_detection_feedback_reports" ON detection_feedback_reports FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_detection_feedback_reports" ON detection_feedback_reports;
CREATE POLICY "insert_own_detection_feedback_reports" ON detection_feedback_reports FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "select_all_detection_feedback_reports_admin" ON detection_feedback_reports;
CREATE POLICY "select_all_detection_feedback_reports_admin" ON detection_feedback_reports FOR SELECT
  TO authenticated USING (public.is_admin_actor());

DROP POLICY IF EXISTS "update_all_detection_feedback_reports_admin" ON detection_feedback_reports;
CREATE POLICY "update_all_detection_feedback_reports_admin" ON detection_feedback_reports FOR UPDATE
  TO authenticated USING (public.is_admin_actor()) WITH CHECK (public.is_admin_actor());
