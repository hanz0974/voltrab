-- Ensure only one active YOLO model at a time
CREATE UNIQUE INDEX IF NOT EXISTS yolo_models_one_active_idx
ON public.yolo_models ((is_active))
WHERE is_active = TRUE;

-- Atomically switch active model in one transaction
CREATE OR REPLACE FUNCTION public.set_active_yolo_model(p_model_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.yolo_models
  SET is_active = FALSE, updated_at = now()
  WHERE is_active = TRUE
    AND id <> p_model_id;

  UPDATE public.yolo_models
  SET is_active = TRUE, updated_at = now()
  WHERE id = p_model_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Model with id % not found', p_model_id;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_active_yolo_model(uuid) TO authenticated;
