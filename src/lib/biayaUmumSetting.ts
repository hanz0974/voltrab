import { supabase } from './supabase';

const DEFAULT_BIAYA_UMUM_KEUNTUNGAN_KOEF = 0.1;
const MIN_BIAYA_UMUM_KEUNTUNGAN_KOEF = 0.1;
const MAX_BIAYA_UMUM_KEUNTUNGAN_KOEF = 0.15;
const LEGACY_SETTING_COMPONENT_ID = '__setting-biaya-umum-keuntungan-koef__';

function clampBiayaUmumKoef(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_BIAYA_UMUM_KEUNTUNGAN_KOEF;
  return Math.min(MAX_BIAYA_UMUM_KEUNTUNGAN_KOEF, Math.max(MIN_BIAYA_UMUM_KEUNTUNGAN_KOEF, value));
}

function parseValue(value: unknown): number {
  if (typeof value === 'number') return clampBiayaUmumKoef(value);
  if (typeof value === 'string') {
    const parsed = Number(value.replace(',', '.').trim());
    return clampBiayaUmumKoef(parsed);
  }
  return DEFAULT_BIAYA_UMUM_KEUNTUNGAN_KOEF;
}

export async function getBiayaUmumKoef(): Promise<number> {
  // Read value from hidden settings row in components.
  const { data } = await supabase
    .from('components')
    .select('unit')
    .eq('id', LEGACY_SETTING_COMPONENT_ID)
    .maybeSingle();

  return parseValue(data?.unit);
}

export async function setBiayaUmumKoef(value: number): Promise<{ error: Error | null; value: number }> {
  const normalizedValue = clampBiayaUmumKoef(value);

  // Persist to hidden settings row in components.
  const unitValue = normalizedValue.toFixed(2);
  const updateResult = await supabase
    .from('components')
    .update({ unit: unitValue, updated_at: new Date().toISOString() })
    .eq('id', LEGACY_SETTING_COMPONENT_ID)
    .select('id');

  if (!updateResult.error && updateResult.data && updateResult.data.length > 0) {
    return { error: null, value: normalizedValue };
  }

  const insertResult = await supabase.from('components').insert({
    id: LEGACY_SETTING_COMPONENT_ID,
    name: '[SYSTEM] Biaya Umum dan Keuntungan Koef',
    category: 'Lainnya',
    unit: unitValue,
    price: 0,
    is_active: false,
  });

  if (!insertResult.error) {
    return { error: null, value: normalizedValue };
  }

  const fallbackError = updateResult.error || insertResult.error;
  return { error: fallbackError ? new Error(fallbackError.message) : new Error('Gagal menyimpan koefisien biaya umum'), value: normalizedValue };
}

export function isHiddenSettingComponentId(componentId: string): boolean {
  return componentId === LEGACY_SETTING_COMPONENT_ID;
}
