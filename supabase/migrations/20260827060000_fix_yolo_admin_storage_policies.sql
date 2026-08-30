-- Align YOLO model and Storage authorization with admin_users.

ALTER TABLE public.yolo_models
  ALTER COLUMN uploaded_by SET DEFAULT auth.uid();

DROP POLICY IF EXISTS "yolo_models_insert" ON public.yolo_models;
CREATE POLICY "yolo_models_insert_admin"
ON public.yolo_models
FOR INSERT
TO authenticated
WITH CHECK (
  public.is_admin_actor()
  AND uploaded_by = auth.uid()
);

DROP POLICY IF EXISTS "yolo_models_update" ON public.yolo_models;
CREATE POLICY "yolo_models_update_admin"
ON public.yolo_models
FOR UPDATE
TO authenticated
USING (public.is_admin_actor())
WITH CHECK (public.is_admin_actor());

DROP POLICY IF EXISTS "yolo_models_delete" ON public.yolo_models;
CREATE POLICY "yolo_models_delete_admin"
ON public.yolo_models
FOR DELETE
TO authenticated
USING (public.is_admin_actor());

DROP POLICY IF EXISTS "yolo_models_storage_upload" ON storage.objects;
CREATE POLICY "yolo_models_storage_upload"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'yolo-models'
  AND public.is_admin_actor()
);

DROP POLICY IF EXISTS "yolo_models_storage_delete" ON storage.objects;
CREATE POLICY "yolo_models_storage_delete"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'yolo-models'
  AND public.is_admin_actor()
);

-- Keep the bucket private. Authenticated reads are still required by the
-- existing application policy; the backend uses a server-side secret key.
UPDATE storage.buckets
SET allowed_mime_types = ARRAY['application/octet-stream', 'model/onnx']
WHERE id = 'yolo-models';

CREATE OR REPLACE FUNCTION public.set_active_yolo_model(p_model_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin_actor() THEN
    RAISE EXCEPTION 'Akses ditolak: hanya admin yang dapat mengaktifkan model.'
      USING ERRCODE = '42501';
  END IF;

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

REVOKE ALL ON FUNCTION public.set_active_yolo_model(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_active_yolo_model(uuid) TO authenticated;

