/*
# Add RPC for deleting detection_feedback_reports

This function performs the delete inside the database so the UI does not
depend on direct table DELETE permissions being applied in every environment.
*/

CREATE OR REPLACE FUNCTION public.delete_detection_feedback_report(p_report_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin_actor() THEN
    RAISE EXCEPTION 'Not allowed to delete detection feedback reports';
  END IF;

  DELETE FROM public.detection_feedback_reports
  WHERE id = p_report_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Report with id % not found', p_report_id;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_detection_feedback_report(uuid) TO authenticated;