-- Create storage bucket for YOLOv8 models
-- Note: Storage buckets are typically created via dashboard, but we can try via SQL
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'yolo-models',
  'yolo-models',
  false,
  524288000, -- 500MB limit
  ARRAY['application/octet-stream', 'model/onnx', '.onnx']
) ON CONFLICT (id) DO NOTHING;

-- Allow authenticated users to upload models (admin only via RLS check)
DROP POLICY IF EXISTS "yolo_models_storage_upload" ON storage.objects;
CREATE POLICY "yolo_models_storage_upload" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'yolo-models' AND
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND is_admin = TRUE)
  );

DROP POLICY IF EXISTS "yolo_models_storage_read" ON storage.objects;
CREATE POLICY "yolo_models_storage_read" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'yolo-models');

DROP POLICY IF EXISTS "yolo_models_storage_delete" ON storage.objects;
CREATE POLICY "yolo_models_storage_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'yolo-models' AND
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND is_admin = TRUE)
  );
