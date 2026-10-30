import { supabase } from './supabase';
import type { ComponentSpec } from '../types';
import { getBiayaUmumKoef, isHiddenSettingComponentId } from './biayaUmumSetting';
import { readAllRows } from './readAllRows';

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
  const [componentsData, detailRows, biayaUmumKoef] = await Promise.all([
    readAllRows<ComponentSpec>((from, to) => supabase
      .from('components')
      .select('id, name, category, unit, price', { count: 'exact' })
      .order('category')
      .order('name')
      .order('id')
      .range(from, to)),
    // Both keys form a stable order; a single request can truncate the AHSP rows.
    readAllRows<DetailKomponenPriceRow>((from, to) => supabase
      .from('component_detail_view')
      .select('component_id, jumlah_harga', { count: 'exact' })
      .order('component_id')
      .order('id')
      .range(from, to)),
    getBiayaUmumKoef(),
  ]);

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
      { event: '*', schema: 'public', table: 'component_details' },
      () => {
        void load();
      },
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'resources' },
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
