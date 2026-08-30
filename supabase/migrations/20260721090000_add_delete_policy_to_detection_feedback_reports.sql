/*
# Add delete policy for detection_feedback_reports

Allows authenticated admin actors to delete detection feedback reports.
The UI still gates deletion behind a resolved-status check and warning modal.
*/

DROP POLICY IF EXISTS "delete_all_detection_feedback_reports_admin" ON detection_feedback_reports;
CREATE POLICY "delete_all_detection_feedback_reports_admin" ON detection_feedback_reports FOR DELETE
  TO authenticated USING (public.is_admin_actor());