/*
# Add system reporting fields to detection_feedback_reports

Adds metadata columns so every automatic detection failure can include
structured diagnostics that are visible to admin.
*/

ALTER TABLE IF EXISTS detection_feedback_reports
  ADD COLUMN IF NOT EXISTS report_source text NOT NULL DEFAULT 'user' CHECK (report_source IN ('user', 'system')),
  ADD COLUMN IF NOT EXISTS error_type text,
  ADD COLUMN IF NOT EXISTS system_report jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_detection_feedback_reports_report_source
  ON detection_feedback_reports(report_source);

CREATE INDEX IF NOT EXISTS idx_detection_feedback_reports_error_type
  ON detection_feedback_reports(error_type);
