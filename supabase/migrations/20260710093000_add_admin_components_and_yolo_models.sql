-- Add is_admin column to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_admin BOOLEAN DEFAULT FALSE;

-- Create components catalog table (manage by admin)
CREATE TABLE IF NOT EXISTS components (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  unit TEXT NOT NULL,
  price BIGINT NOT NULL DEFAULT 0,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create yolo_models table for model management
CREATE TABLE IF NOT EXISTS yolo_models (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  version TEXT,
  file_path TEXT,
  file_size BIGINT,
  is_active BOOLEAN DEFAULT TRUE,
  uploaded_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE components ENABLE ROW LEVEL SECURITY;
ALTER TABLE yolo_models ENABLE ROW LEVEL SECURITY;

-- RLS policies for components (admin only can modify, all authenticated can read)
DROP POLICY IF EXISTS "components_select" ON components;
CREATE POLICY "components_select" ON components FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "components_insert" ON components;
CREATE POLICY "components_insert" ON components FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND is_admin = TRUE)
  );

DROP POLICY IF EXISTS "components_update" ON components;
CREATE POLICY "components_update" ON components FOR UPDATE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND is_admin = TRUE)
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND is_admin = TRUE)
  );

DROP POLICY IF EXISTS "components_delete" ON components;
CREATE POLICY "components_delete" ON components FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND is_admin = TRUE)
  );

-- RLS policies for yolo_models
DROP POLICY IF EXISTS "yolo_models_select" ON yolo_models;
CREATE POLICY "yolo_models_select" ON yolo_models FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "yolo_models_insert" ON yolo_models;
CREATE POLICY "yolo_models_insert" ON yolo_models FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND is_admin = TRUE)
  );

DROP POLICY IF EXISTS "yolo_models_update" ON yolo_models;
CREATE POLICY "yolo_models_update" ON yolo_models FOR UPDATE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND is_admin = TRUE)
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND is_admin = TRUE)
  );

DROP POLICY IF EXISTS "yolo_models_delete" ON yolo_models;
CREATE POLICY "yolo_models_delete" ON yolo_models FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND is_admin = TRUE)
  );

-- Insert default components from catalog
INSERT INTO components (id, name, category, unit, price) VALUES
  ('c-mcb-16', 'MCB 16A 1P', 'Pengaman', 'unit', 85000),
  ('c-mcb-25', 'MCB 25A 1P', 'Pengaman', 'unit', 95000),
  ('c-mccb-100', 'MCCB 100A 3P', 'Pengaman', 'unit', 1250000),
  ('c-rccb-40', 'RCCB 40A 2P 30mA', 'Pengaman', 'unit', 320000),
  ('c-led-18', 'Lampu LED 18W', 'Penerangan', 'unit', 75000),
  ('c-led-down', 'Downlight LED 12W', 'Penerangan', 'unit', 95000),
  ('c-tl-led', 'TL LED 20W 120cm', 'Penerangan', 'unit', 110000),
  ('c-saklar-1', 'Saklar Tunggal', 'Saklar & Stop Kontak', 'titik', 35000),
  ('c-saklar-2', 'Saklar Ganda', 'Saklar & Stop Kontak', 'titik', 45000),
  ('c-stop-1', 'Stop Kontak Tunggal', 'Saklar & Stop Kontak', 'titik', 42000),
  ('c-stop-2', 'Stop Kontak Ganda', 'Saklar & Stop Kontak', 'titik', 55000),
  ('c-kabel-nya-3x2.5', 'Kabel NYA 3x2.5mm', 'Kabel', 'm', 12500),
  ('c-kabel-nym-3x2.5', 'Kabel NYM 3x2.5mm', 'Kabel', 'm', 18500),
  ('c-kabel-nym-3x4', 'Kabel NYM 3x4mm', 'Kabel', 'm', 28000),
  ('c-kabel-nycu', 'Kabel NYCU 6mm', 'Kabel', 'm', 32000),
  ('c-panel-box', 'Box Panel 1 Pintu', 'Panel & MDP', 'unit', 450000),
  ('c-mdp', 'MDP (Main Distribution Panel)', 'Panel & MDP', 'unit', 3500000),
  ('c-sdp', 'SDP (Sub Distribution Panel)', 'Panel & MDP', 'unit', 1850000),
  ('c-pipa-conduit', 'Pipa Conduit 3/4"', 'Lainnya', 'm', 15000),
  ('c-accessories', 'Aksesoris Instalasi', 'Lainnya', 'set', 25000)
ON CONFLICT (id) DO NOTHING;

-- Set first user as admin (for demo purposes)
UPDATE users SET is_admin = TRUE WHERE id = (SELECT id FROM users ORDER BY created_at LIMIT 1);
