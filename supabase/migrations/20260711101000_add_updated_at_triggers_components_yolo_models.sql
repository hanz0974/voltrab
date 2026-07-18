-- Keep updated_at current on row updates
DROP TRIGGER IF EXISTS trg_components_updated_at ON public.components;
CREATE TRIGGER trg_components_updated_at
  BEFORE UPDATE ON public.components
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS trg_yolo_models_updated_at ON public.yolo_models;
CREATE TRIGGER trg_yolo_models_updated_at
  BEFORE UPDATE ON public.yolo_models
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
