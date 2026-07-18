import { supabase } from './supabase';
import type { ComponentSpec } from '../types';
import { getBiayaUmumKoef, isHiddenSettingComponentId } from './biayaUmumSetting';

let activeChannel: ReturnType<typeof supabase.channel> | null = null;

interface DetailKomponenPriceRow {
  component_id: string;
  jumlah_harga: number | string;
}

const parseNumber = (value: number | string): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

export async function fetchActiveComponents(): Promise<ComponentSpec[]> {
  const [{ data: componentsData, error: componentsError }, { data: detailRows }, biayaUmumKoef] = await Promise.all([
    supabase
      .from('components')
      .select('id, name, category, unit, price')
      .eq('is_active', true)
      .order('category')
      .order('name'),
    supabase.from('detail_komponen').select('component_id, jumlah_harga'),
    getBiayaUmumKoef(),
  ]);

  if (componentsError) {
    throw componentsError;
  }

  const dTotalByComponent = new Map<string, number>();
  for (const row of (detailRows ?? []) as DetailKomponenPriceRow[]) {
    const current = dTotalByComponent.get(row.component_id) ?? 0;
    dTotalByComponent.set(row.component_id, current + parseNumber(row.jumlah_harga));
  }

  const normalizedComponents = ((componentsData ?? []) as ComponentSpec[])
    .filter((component) => !isHiddenSettingComponentId(component.id))
    .map((component) => {
      const dTotal = dTotalByComponent.get(component.id) ?? 0;

      // Keep manual/base price if there is no detail row yet.
      if (dTotal <= 0) {
        return component;
      }

      return {
        ...component,
        price: Math.round(dTotal * (1 + biayaUmumKoef)),
      };
    });

  return normalizedComponents;
}

export function subscribeToActiveComponents(onChange: (components: ComponentSpec[]) => void) {
  const load = async () => {
    try {
      const components = await fetchActiveComponents();
      onChange(components);
    } catch {
      onChange([]);
    }
  };

  if (activeChannel) {
    supabase.removeChannel(activeChannel);
  }

  const onFocus = () => {
    void load();
  };

  const intervalId = window.setInterval(() => {
    void load();
  }, 15000);

  if (typeof window !== 'undefined') {
    window.addEventListener('focus', onFocus);
  }

  activeChannel = supabase.channel('components-active-catalog');
  activeChannel
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'components' },
      () => {
        void load();
      },
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'detail_komponen' },
      () => {
        void load();
      },
    )
    .subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        void load();
      }
    });

  void load();

  return () => {
    window.clearInterval(intervalId);
    if (typeof window !== 'undefined') {
      window.removeEventListener('focus', onFocus);
    }

    if (activeChannel) {
      supabase.removeChannel(activeChannel);
      activeChannel = null;
    }
  };
}
