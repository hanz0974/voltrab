import { Fragment, useState, useEffect, useCallback, type FormEvent } from 'react';
import {
  Plus,
  Search,
  Edit2,
  Trash2,
  X,
  Package,
  Save,
  Loader2,
  AlertCircle,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { getBiayaUmumKoef, isHiddenSettingComponentId, setBiayaUmumKoef as persistBiayaUmumKoefSetting } from '../lib/biayaUmumSetting';
import type { PartCategory } from '../types';
import { CATEGORY_COLORS, formatRupiah } from '../data';

interface ComponentRecord {
  id: string;
  name: string;
  category: PartCategory;
  unit: string;
  price: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

interface DetailKomponenRecord {
  id: string;
  component_id: string;
  jenis: 'A. Tenaga kerja' | 'B. Bahan' | 'C. Peralatan';
  uraian: string;
  satuan: string;
  koefisien: number | string;
  harga_satuan: number;
  jumlah_harga: number | string;
  created_at: string;
  updated_at: string;
}

const CATEGORIES: PartCategory[] = [
  'Pengaman',
  'Penerangan',
  'Saklar & Stop Kontak',
  'Kabel',
  'Panel & MDP',
  'Lainnya',
];

const emptyForm = {
  id: '',
  name: '',
  category: 'Lainnya' as PartCategory,
  unit: 'unit',
  price: 0,
};

const emptyDetailForm = {
  jenis: 'B. Bahan' as 'A. Tenaga kerja' | 'B. Bahan' | 'C. Peralatan',
  uraian: '',
  satuan: 'unit',
  koefisien: '1',
  harga_satuan: '0',
};

const DETAIL_JENIS_OPTIONS = ['A. Tenaga kerja', 'B. Bahan', 'C. Peralatan'] as const;
const BAHAN_SATUAN_OPTIONS = ['buah', 'unit', 'm'] as const;

const parseNumber = (value: number | string): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const parseDecimalInput = (value: number | string): number => {
  const normalized = String(value).replace(',', '.');
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
};

const parseRupiahInput = (value: number | string): number => {
  const digitsOnly = String(value).replace(/[^\d]/g, '');
  if (!digitsOnly) return 0;
  return Number.parseInt(digitsOnly, 10) || 0;
};

const clampBiayaUmumKoef = (value: number): number => {
  if (!Number.isFinite(value)) return 0.1;
  return Math.min(0.15, Math.max(0.1, value));
};

const formatRupiahInput = (value: number | string): string => {
  const numericValue = parseRupiahInput(value);
  return new Intl.NumberFormat('id-ID').format(numericValue);
};

export function ComponentsManager() {
  const [components, setComponents] = useState<ComponentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<PartCategory | 'all'>('all');
  const [showForm, setShowForm] = useState(false);
  const [editingComponent, setEditingComponent] = useState<ComponentRecord | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [activeDetailComponent, setActiveDetailComponent] = useState<ComponentRecord | null>(null);
  const [details, setDetails] = useState<DetailKomponenRecord[]>([]);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [detailsSaving, setDetailsSaving] = useState(false);
  const [editingDetailId, setEditingDetailId] = useState<string | null>(null);
  const [detailForm, setDetailForm] = useState(emptyDetailForm);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [biayaUmumKoef, setBiayaUmumKoef] = useState('0,10');
  const [biayaUmumKoefSaving, setBiayaUmumKoefSaving] = useState(false);

  const fetchComponents = useCallback(async () => {
    setLoading(true);
    setError(null);

    const { data, error: fetchError } = await supabase
      .from('components')
      .select('*')
      .order('category')
      .order('name');

    if (!fetchError && data) {
      setComponents(data as ComponentRecord[]);
    } else {
      setComponents([]);
      setError(fetchError?.message ?? 'Gagal memuat komponen katalog');
    }

    setLoading(false);
  }, []);

  useEffect(() => {
    void fetchComponents();
  }, [fetchComponents]);

  const fetchBiayaUmumKoef = useCallback(async () => {
    try {
      const value = await getBiayaUmumKoef();
      setBiayaUmumKoef(clampBiayaUmumKoef(value).toFixed(2).replace('.', ','));
    } catch (error) {
      setDetailError(error instanceof Error ? error.message : 'Gagal memuat koefisien biaya umum');
    }
  }, []);

  useEffect(() => {
    void fetchBiayaUmumKoef();
  }, [fetchBiayaUmumKoef]);

  const recalculateComponentPrice = useCallback(
    async (componentId: string, koefValue?: number) => {
      if (isHiddenSettingComponentId(componentId)) return;

      const effectiveKoef = clampBiayaUmumKoef(koefValue ?? (await getBiayaUmumKoef()));

      const { data: detailRows, error: detailErrorFetch } = await supabase
        .from('detail_komponen')
        .select('jumlah_harga')
        .eq('component_id', componentId);

      if (detailErrorFetch) {
        throw new Error(detailErrorFetch.message ?? 'Gagal menghitung total detail komponen');
      }

      const dTotal = (detailRows ?? []).reduce((sum, row) => sum + parseNumber((row as { jumlah_harga: number | string }).jumlah_harga), 0);
      const nextPrice = Math.round(dTotal * (1 + effectiveKoef));

      const { error: updateError } = await supabase
        .from('components')
        .update({
          price: nextPrice,
          updated_at: new Date().toISOString(),
        })
        .eq('id', componentId);

      if (updateError) {
        throw new Error(updateError.message ?? 'Gagal sinkronisasi harga komponen');
      }
    },
    [],
  );

  const recalculateAllComponentPrices = useCallback(
    async (koefValue?: number) => {
      const effectiveKoef = clampBiayaUmumKoef(koefValue ?? (await getBiayaUmumKoef()));
      const targetComponents = components.filter((component) => !isHiddenSettingComponentId(component.id));

      for (const component of targetComponents) {
        await recalculateComponentPrice(component.id, effectiveKoef);
      }
    },
    [components, recalculateComponentPrice],
  );

  const filteredComponents = components.filter((component) => {
    if (isHiddenSettingComponentId(component.id)) return false;

    const matchesSearch =
      component.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      component.id.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = categoryFilter === 'all' || component.category === categoryFilter;
    return matchesSearch && matchesCategory;
  });

  const groupedComponents = filteredComponents.reduce<Record<PartCategory, ComponentRecord[]>>((acc, component) => {
    if (!acc[component.category]) acc[component.category] = [];
    acc[component.category].push(component);
    return acc;
  }, {} as Record<PartCategory, ComponentRecord[]>);

  const openAddForm = () => {
    setEditingComponent(null);
    setForm({ ...emptyForm, id: `c-${Date.now().toString(36)}` });
    setShowForm(true);
    setError(null);
  };

  const openEditForm = (component: ComponentRecord) => {
    setEditingComponent(component);
    setForm({
      id: component.id,
      name: component.name,
      category: component.category,
      unit: component.unit,
      price: component.price,
    });
    setShowForm(true);
    setError(null);
  };

  const closeForm = () => {
    setShowForm(false);
    setEditingComponent(null);
    setForm(emptyForm);
    setError(null);
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!form.name.trim()) {
      setError('Nama komponen wajib diisi');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      if (editingComponent) {
        const { error: updateError } = await supabase
          .from('components')
          .update({
            name: form.name.trim(),
            category: form.category,
            unit: form.unit.trim(),
            updated_at: new Date().toISOString(),
          })
          .eq('id', form.id);

        if (updateError) throw updateError;
      } else {
        const { error: insertError } = await supabase.from('components').insert({
          id: form.id,
          name: form.name.trim(),
          category: form.category,
          unit: form.unit.trim(),
          price: 0,
          is_active: true,
        });

        if (insertError) throw insertError;
      }

      await fetchComponents();
      closeForm();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal menyimpan komponen');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    const { error: deleteError } = await supabase.from('components').delete().eq('id', id);
    if (!deleteError) {
      setComponents((previous) => previous.filter((component) => component.id !== id));
    } else {
      setError(deleteError.message ?? 'Gagal menghapus komponen');
    }
    setDeleteConfirm(null);
  };

  const handleToggleActive = async (component: ComponentRecord) => {
    const { error: updateError } = await supabase
      .from('components')
      .update({ is_active: !component.is_active, updated_at: new Date().toISOString() })
      .eq('id', component.id);

    if (!updateError) {
      setComponents((previous) =>
        previous.map((item) => (item.id === component.id ? { ...item, is_active: !item.is_active } : item)),
      );
    } else {
      setError(updateError.message ?? 'Gagal mengubah status komponen');
    }
  };

  const fetchComponentDetails = useCallback(async (componentId: string) => {
    setDetailsLoading(true);
    setDetailError(null);

    const { data, error: fetchError } = await supabase
      .from('detail_komponen')
      .select('*')
      .eq('component_id', componentId)
      .order('created_at', { ascending: true });

    if (fetchError) {
      setDetails([]);
      setDetailError(fetchError.message ?? 'Gagal memuat detail komponen');
    } else {
      setDetails((data ?? []) as DetailKomponenRecord[]);
    }

    setDetailsLoading(false);
  }, []);

  const openDetailModal = async (component: ComponentRecord) => {
    setActiveDetailComponent(component);
    setShowDetailModal(true);
    setEditingDetailId(null);
    setDetailForm(emptyDetailForm);
    setDetailError(null);
    await fetchComponentDetails(component.id);
  };

  const closeDetailModal = () => {
    setShowDetailModal(false);
    setActiveDetailComponent(null);
    setDetails([]);
    setEditingDetailId(null);
    setDetailForm(emptyDetailForm);
    setDetailError(null);
  };

  const persistBiayaUmumKoef = async (rawValue: string) => {
    const normalizedValue = clampBiayaUmumKoef(parseDecimalInput(rawValue));
    setBiayaUmumKoef(normalizedValue.toFixed(2).replace('.', ','));
    setBiayaUmumKoefSaving(true);

    const { error: writeError } = await persistBiayaUmumKoefSetting(normalizedValue);

    if (writeError) {
      setDetailError(writeError.message ?? 'Gagal menyimpan koefisien biaya umum');
    } else {
      try {
        await recalculateAllComponentPrices(normalizedValue);
      } catch (syncError) {
        setDetailError(syncError instanceof Error ? syncError.message : 'Gagal sinkronisasi harga komponen');
      }

      await fetchComponents();
      if (activeDetailComponent) {
        await fetchComponentDetails(activeDetailComponent.id);
      }
    }

    setBiayaUmumKoefSaving(false);
  };

  const startEditDetail = (detail: DetailKomponenRecord) => {
    setEditingDetailId(detail.id);
    setDetailForm({
      jenis: detail.jenis,
      uraian: detail.uraian,
      satuan: detail.satuan,
      koefisien: String(detail.koefisien),
      harga_satuan: formatRupiahInput(parseNumber(detail.harga_satuan)),
    });
    setDetailError(null);
  };

  const resetDetailEditor = () => {
    setEditingDetailId(null);
    setDetailForm(emptyDetailForm);
    setDetailError(null);
  };

  const handleDetailSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!activeDetailComponent) return;
    if (!detailForm.uraian.trim()) {
      setDetailError('Uraian wajib diisi');
      return;
    }
    const normalizedSatuan =
      detailForm.jenis === 'A. Tenaga kerja'
        ? 'oh'
        : detailForm.jenis === 'B. Bahan'
          ? BAHAN_SATUAN_OPTIONS.includes(detailForm.satuan as (typeof BAHAN_SATUAN_OPTIONS)[number])
            ? detailForm.satuan
            : 'unit'
          : detailForm.satuan;

    if (!normalizedSatuan.trim()) {
      setDetailError('Satuan wajib diisi');
      return;
    }

    const koefisien = Math.max(0, parseDecimalInput(detailForm.koefisien));
    const hargaSatuan = Math.max(0, parseRupiahInput(detailForm.harga_satuan));

    setDetailsSaving(true);
    setDetailError(null);

    try {
      if (editingDetailId) {
        const { error: updateError } = await supabase
          .from('detail_komponen')
          .update({
            jenis: detailForm.jenis,
            uraian: detailForm.uraian.trim(),
            satuan: normalizedSatuan.trim(),
            koefisien,
            harga_satuan: hargaSatuan,
          })
          .eq('id', editingDetailId);

        if (updateError) throw updateError;
      } else {
        const { error: insertError } = await supabase.from('detail_komponen').insert({
          component_id: activeDetailComponent.id,
          jenis: detailForm.jenis,
          uraian: detailForm.uraian.trim(),
          satuan: normalizedSatuan.trim(),
          koefisien,
          harga_satuan: hargaSatuan,
        });

        if (insertError) throw insertError;
      }

      await recalculateComponentPrice(activeDetailComponent.id);
      await fetchComponentDetails(activeDetailComponent.id);
      await fetchComponents();
      resetDetailEditor();
    } catch (err) {
      setDetailError(err instanceof Error ? err.message : 'Gagal menyimpan detail komponen');
    } finally {
      setDetailsSaving(false);
    }
  };

  const handleDeleteDetail = async (detailId: string) => {
    if (!activeDetailComponent) return;

    const { error: deleteError } = await supabase.from('detail_komponen').delete().eq('id', detailId);
    if (deleteError) {
      setDetailError(deleteError.message ?? 'Gagal menghapus detail komponen');
      return;
    }

    await recalculateComponentPrice(activeDetailComponent.id);
    await fetchComponentDetails(activeDetailComponent.id);
    await fetchComponents();
  };

  const detailSubtotal = parseDecimalInput(detailForm.koefisien) * parseRupiahInput(detailForm.harga_satuan);
  const detailGrandTotal = details.reduce((sum, detail) => sum + parseNumber(detail.jumlah_harga), 0);
  const dTotal = detailGrandTotal;
  const eKoef = clampBiayaUmumKoef(parseDecimalInput(biayaUmumKoef));
  const eTotal = dTotal * eKoef;
  const fTotal = dTotal + eTotal;
  const groupedDetails = DETAIL_JENIS_OPTIONS.map((jenis) => ({
    jenis,
    items: details.filter((detail) => detail.jenis === jenis),
  }));

  return (
    <div>
      <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Komponen Katalog</h2>
          <p className="mt-1 text-slate-600">Kelola daftar komponen dan harga untuk RAB.</p>
        </div>
        <button
          onClick={openAddForm}
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-brand-700"
        >
          <Plus className="h-4 w-4" />
          Tambah Komponen
        </button>
      </div>

      <div className="mb-6 flex flex-col gap-4 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Cari komponen..."
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            className="w-full rounded-lg border border-slate-200 py-2.5 pl-10 pr-4 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
          />
        </div>
        <select
          value={categoryFilter}
          onChange={(event) => setCategoryFilter(event.target.value as PartCategory | 'all')}
          className="rounded-lg border border-slate-200 px-4 py-2.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
        >
          <option value="all">Semua Kategori</option>
          {CATEGORIES.map((category) => (
            <option key={category} value={category}>
              {category}
            </option>
          ))}
        </select>
      </div>

      {error && !showForm && (
        <div className="mb-6 flex items-center gap-2 rounded-lg bg-rose-50 p-3 text-sm text-rose-700">
          <AlertCircle className="h-4 w-4 flex-shrink-0" />
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-brand-600" />
        </div>
      ) : (
        <div className="space-y-6">
          {Object.entries(groupedComponents).map(([category, items]) => (
            <div key={category}>
              <div className="mb-3 flex items-center gap-2">
                <span
                  className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ${
                    CATEGORY_COLORS[category as PartCategory]?.bg || 'bg-slate-100'
                  } ${CATEGORY_COLORS[category as PartCategory]?.text || 'text-slate-700'}`}
                >
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${
                      CATEGORY_COLORS[category as PartCategory]?.dot || 'bg-slate-500'
                    }`}
                  />
                  {category}
                </span>
                <span className="text-sm text-slate-500">{items.length} komponen</span>
              </div>

              <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                <table className="min-w-full divide-y divide-slate-200">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600">ID</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600">Nama</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600">Satuan</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-slate-600">Harga</th>
                      <th className="px-4 py-3 text-center text-xs font-semibold text-slate-600">Status</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-slate-600">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {items.map((component) => (
                      <tr
                        key={component.id}
                        className={`transition-colors hover:bg-slate-50 ${!component.is_active ? 'opacity-60' : ''}`}
                      >
                        <td className="whitespace-nowrap px-4 py-3 text-sm font-mono text-slate-500">{component.id}</td>
                        <td className="whitespace-nowrap px-4 py-3 text-sm font-medium text-slate-900">{component.name}</td>
                        <td className="whitespace-nowrap px-4 py-3 text-sm text-slate-600">{component.unit}</td>
                        <td className="whitespace-nowrap px-4 py-3 text-right text-sm text-slate-900">
                          {formatRupiah(component.price)}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <button
                            onClick={() => void handleToggleActive(component)}
                            className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
                              component.is_active
                                ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                            }`}
                          >
                            {component.is_active ? 'Aktif' : 'Nonaktif'}
                          </button>
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              onClick={() => void openDetailModal(component)}
                              className="rounded-lg px-2.5 py-2 text-xs font-semibold text-brand-700 transition-colors hover:bg-brand-50"
                              title="Kelola Detail"
                            >
                              Detail
                            </button>
                            <button
                              onClick={() => openEditForm(component)}
                              className="rounded-lg p-2 text-slate-500 transition-colors hover:bg-brand-50 hover:text-brand-600"
                              title="Edit"
                            >
                              <Edit2 className="h-4 w-4" />
                            </button>
                            <button
                              onClick={() => setDeleteConfirm(component.id)}
                              className="rounded-lg p-2 text-slate-500 transition-colors hover:bg-rose-50 hover:text-rose-600"
                              title="Hapus"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}

          {filteredComponents.length === 0 && (
            <div className="rounded-xl border border-slate-200 bg-white py-12 text-center">
              <Package className="mx-auto h-12 w-12 text-slate-300" />
              <p className="mt-3 text-sm text-slate-500">Tidak ada komponen ditemukan.</p>
            </div>
          )}
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/50" onClick={closeForm} />
          <div className="relative w-full max-w-lg rounded-xl bg-white p-6 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-slate-900">
                {editingComponent ? 'Edit Komponen' : 'Tambah Komponen Baru'}
              </h3>
              <button onClick={closeForm} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600">
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit}>
              {error && (
                <div className="mb-4 flex items-center gap-2 rounded-lg bg-rose-50 p-3 text-sm text-rose-700">
                  <AlertCircle className="h-4 w-4 flex-shrink-0" />
                  {error}
                </div>
              )}

              <div className="space-y-4">
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-slate-700">ID Komponen</label>
                  <input
                    type="text"
                    value={form.id}
                    onChange={(event) => setForm((previous) => ({ ...previous, id: event.target.value }))}
                    disabled={!!editingComponent}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm disabled:bg-slate-50 disabled:text-slate-500"
                    placeholder="c-example-1"
                  />
                </div>

                <div>
                  <label className="mb-1.5 block text-sm font-medium text-slate-700">Nama Komponen *</label>
                  <input
                    type="text"
                    value={form.name}
                    onChange={(event) => setForm((previous) => ({ ...previous, name: event.target.value }))}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                    placeholder="MCB 16A 1P"
                    required
                  />
                </div>

                <div>
                  <label className="mb-1.5 block text-sm font-medium text-slate-700">Kategori</label>
                  <select
                    value={form.category}
                    onChange={(event) =>
                      setForm((previous) => ({ ...previous, category: event.target.value as PartCategory }))
                    }
                    className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                  >
                    {CATEGORIES.map((category) => (
                      <option key={category} value={category}>
                        {category}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-slate-700">Satuan</label>
                    <input
                      type="text"
                      value={form.unit}
                      onChange={(event) => setForm((previous) => ({ ...previous, unit: event.target.value }))}
                      className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                      placeholder="unit / m / titik"
                    />
                  </div>

                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-slate-700">Harga (Rp)</label>
                    <input
                      type="number"
                      value={form.price}
                      readOnly
                      className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-500"
                      min="0"
                    />
                    <p className="mt-1 text-[11px] text-slate-500">
                      Otomatis dari total detail komponen (D + E).
                    </p>
                  </div>
                </div>
              </div>

              <div className="mt-6 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={closeForm}
                  className="rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-700 disabled:opacity-50"
                >
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  Simpan
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/50" onClick={() => setDeleteConfirm(null)} />
          <div className="relative w-full max-w-sm rounded-xl bg-white p-6 shadow-xl">
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-rose-100">
              <Trash2 className="h-6 w-6 text-rose-600" />
            </div>
            <h3 className="text-lg font-semibold text-slate-900">Hapus Komponen?</h3>
            <p className="mt-2 text-sm text-slate-600">
              Tindakan ini tidak dapat dibatalkan. Komponen akan dihapus permanen dari katalog.
            </p>
            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={() => setDeleteConfirm(null)}
                className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
              >
                Batal
              </button>
              <button
                onClick={() => void handleDelete(deleteConfirm)}
                className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-rose-700"
              >
                Hapus
              </button>
            </div>
          </div>
        </div>
      )}

      {showDetailModal && activeDetailComponent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/50" onClick={closeDetailModal} />
          <div className="relative w-full max-w-5xl rounded-xl bg-white p-6 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold text-slate-900">Detail Komponen</h3>
                <p className="text-sm text-slate-600">
                  {activeDetailComponent.name} ({activeDetailComponent.id})
                </p>
              </div>
              <button
                onClick={closeDetailModal}
                className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="grid gap-6 lg:grid-cols-[1.8fr_1fr]">
              <div className="space-y-3">
                <div className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2">
                  <div className="text-sm text-slate-600">Total detail komponen</div>
                  <div className="text-sm font-semibold text-slate-900">{formatRupiah(Math.round(fTotal))}</div>
                </div>

                {detailsLoading ? (
                  <div className="flex items-center justify-center rounded-xl border border-slate-200 py-10">
                    <Loader2 className="h-6 w-6 animate-spin text-brand-600" />
                  </div>
                ) : details.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-slate-200 py-10 text-center text-sm text-slate-500">
                    Belum ada detail. Tambahkan uraian pertama untuk komponen ini.
                  </div>
                ) : (
                  <div className="max-h-[55vh] overflow-auto rounded-xl border border-slate-200">
                    <table className="min-w-full divide-y divide-slate-200">
                      <thead className="bg-slate-50">
                        <tr>
                          <th className="px-3 py-2 text-left text-xs font-semibold text-slate-600">Uraian</th>
                          <th className="px-3 py-2 text-left text-xs font-semibold text-slate-600">Sat</th>
                          <th className="px-3 py-2 text-right text-xs font-semibold text-slate-600">Koefisien</th>
                          <th className="px-3 py-2 text-right text-xs font-semibold text-slate-600">Harga Satuan (Rp)</th>
                          <th className="px-3 py-2 text-right text-xs font-semibold text-slate-600">Jumlah Harga (Rp)</th>
                          <th className="px-3 py-2 text-right text-xs font-semibold text-slate-600">Aksi</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200">
                        {groupedDetails.map((group) => (
                          <Fragment key={group.jenis}>
                            <tr key={`heading-${group.jenis}`} className="bg-slate-100/80">
                              <td colSpan={6} className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-700">
                                {group.jenis}
                              </td>
                            </tr>
                            {group.items.length === 0 ? (
                              <tr key={`empty-${group.jenis}`}>
                                <td colSpan={6} className="px-3 py-2 text-sm italic text-slate-400">
                                  Belum ada uraian pada kategori ini.
                                </td>
                              </tr>
                            ) : (
                              group.items.map((detail) => (
                                <tr key={detail.id}>
                                  <td className="px-3 py-2 text-sm text-slate-800">{detail.uraian}</td>
                                  <td className="px-3 py-2 text-sm text-slate-600">{detail.satuan}</td>
                                  <td className="px-3 py-2 text-right text-sm text-slate-700">
                                    {parseNumber(detail.koefisien).toLocaleString('id-ID', { maximumFractionDigits: 4 })}
                                  </td>
                                  <td className="px-3 py-2 text-right text-sm text-slate-700">
                                    {formatRupiah(parseNumber(detail.harga_satuan))}
                                  </td>
                                  <td className="px-3 py-2 text-right text-sm font-medium text-slate-900">
                                    {formatRupiah(Math.round(parseNumber(detail.jumlah_harga)))}
                                  </td>
                                  <td className="px-3 py-2 text-right">
                                    <div className="flex items-center justify-end gap-1">
                                      <button
                                        onClick={() => startEditDetail(detail)}
                                        className="rounded p-1.5 text-slate-500 hover:bg-brand-50 hover:text-brand-600"
                                        title="Edit Detail"
                                      >
                                        <Edit2 className="h-4 w-4" />
                                      </button>
                                      <button
                                        onClick={() => void handleDeleteDetail(detail.id)}
                                        className="rounded p-1.5 text-slate-500 hover:bg-rose-50 hover:text-rose-600"
                                        title="Hapus Detail"
                                      >
                                        <Trash2 className="h-4 w-4" />
                                      </button>
                                    </div>
                                  </td>
                                </tr>
                              ))
                            )}
                          </Fragment>
                        ))}

                        <tr className="bg-slate-100">
                          <td className="px-3 py-2 text-sm font-semibold text-slate-800">D. Jumlah A + B + C</td>
                          <td className="px-3 py-2 text-sm text-slate-500">-</td>
                          <td className="px-3 py-2 text-right text-sm text-slate-500">-</td>
                          <td className="px-3 py-2 text-right text-sm text-slate-500">-</td>
                          <td className="px-3 py-2 text-right text-sm font-semibold text-slate-900">{formatRupiah(Math.round(dTotal))}</td>
                          <td className="px-3 py-2" />
                        </tr>

                        <tr className="bg-amber-50/70">
                          <td className="px-3 py-2 text-sm font-semibold text-slate-800">E. Biaya Umum dan Keuntungan</td>
                          <td className="px-3 py-2 text-sm text-slate-600">x D</td>
                          <td className="px-3 py-2 text-right">
                            <input
                              type="text"
                              inputMode="decimal"
                              value={biayaUmumKoef}
                              onChange={(event) => setBiayaUmumKoef(event.target.value)}
                              onBlur={(event) => {
                                void persistBiayaUmumKoef(event.target.value);
                              }}
                              className="w-20 rounded border border-slate-300 px-2 py-1 text-right text-xs focus:border-brand-500 focus:outline-none"
                              title="Rentang 0,10 sampai 0,15"
                            />
                            <div className="mt-1 text-[11px] text-slate-500">{(eKoef * 100).toFixed(2).replace('.', ',')}%</div>
                            {biayaUmumKoefSaving && (
                              <div className="mt-1 text-[11px] text-brand-600">Menyimpan...</div>
                            )}
                          </td>
                          <td className="px-3 py-2 text-right text-sm text-slate-500">-</td>
                          <td className="px-3 py-2 text-right text-sm font-semibold text-slate-900">{formatRupiah(Math.round(eTotal))}</td>
                          <td className="px-3 py-2" />
                        </tr>

                        <tr className="bg-emerald-50/70">
                          <td className="px-3 py-2 text-sm font-semibold text-slate-900">F. Harga Satuan Pekerjaan (D + E)</td>
                          <td className="px-3 py-2 text-sm text-slate-500">-</td>
                          <td className="px-3 py-2 text-right text-sm text-slate-500">-</td>
                          <td className="px-3 py-2 text-right text-sm text-slate-500">-</td>
                          <td className="px-3 py-2 text-right text-sm font-bold text-slate-900">{formatRupiah(Math.round(fTotal))}</td>
                          <td className="px-3 py-2" />
                        </tr>
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              <div>
                <h4 className="mb-3 text-sm font-semibold text-slate-800">
                  {editingDetailId ? 'Edit Detail Uraian' : 'Tambah Detail Uraian'}
                </h4>
                <form onSubmit={handleDetailSubmit} className="space-y-3 rounded-xl border border-slate-200 p-4">
                  {detailError && (
                    <div className="flex items-center gap-2 rounded-lg bg-rose-50 p-3 text-xs text-rose-700">
                      <AlertCircle className="h-4 w-4 flex-shrink-0" />
                      {detailError}
                    </div>
                  )}

                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-slate-700">Jenis</label>
                    <select
                      value={detailForm.jenis}
                      onChange={(event) =>
                        setDetailForm((previous) => ({
                          ...previous,
                          jenis: event.target.value as (typeof DETAIL_JENIS_OPTIONS)[number],
                          satuan:
                            event.target.value === 'A. Tenaga kerja'
                              ? 'OH'
                              : event.target.value === 'B. Bahan'
                                ? BAHAN_SATUAN_OPTIONS.includes(previous.satuan as (typeof BAHAN_SATUAN_OPTIONS)[number])
                                  ? previous.satuan
                                  : 'unit'
                                : previous.satuan === 'OH'
                                  ? 'unit'
                                  : previous.satuan,
                        }))
                      }
                      className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                    >
                      {DETAIL_JENIS_OPTIONS.map((jenis) => (
                        <option key={jenis} value={jenis}>
                          {jenis}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-slate-700">Uraian</label>
                    <input
                      type="text"
                      value={detailForm.uraian}
                      onChange={(event) => setDetailForm((previous) => ({ ...previous, uraian: event.target.value }))}
                      className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                      placeholder="Contoh: Upah pekerja"
                      required
                    />
                  </div>

                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-slate-700">Satuan</label>
                    {detailForm.jenis === 'A. Tenaga kerja' ? (
                      <input
                        type="text"
                        value="OH"
                        disabled
                        className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-600"
                      />
                    ) : detailForm.jenis === 'B. Bahan' ? (
                      <select
                        value={
                          BAHAN_SATUAN_OPTIONS.includes(detailForm.satuan as (typeof BAHAN_SATUAN_OPTIONS)[number])
                            ? detailForm.satuan
                            : 'unit'
                        }
                        onChange={(event) =>
                          setDetailForm((previous) => ({
                            ...previous,
                            satuan: event.target.value,
                          }))
                        }
                        className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                      >
                        {BAHAN_SATUAN_OPTIONS.map((option) => (
                          <option key={option} value={option}>
                            {option}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        type="text"
                        value={detailForm.satuan}
                        onChange={(event) => setDetailForm((previous) => ({ ...previous, satuan: event.target.value }))}
                        className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                        placeholder="unit / set / m"
                        required
                      />
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="mb-1.5 block text-sm font-medium text-slate-700">Koefisien</label>
                      <input
                        type="text"
                        inputMode="decimal"
                        value={detailForm.koefisien}
                        onChange={(event) =>
                          setDetailForm((previous) => ({
                            ...previous,
                            koefisien: event.target.value,
                          }))
                        }
                        className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                        placeholder="Contoh: 0.50 atau 0,50"
                      />
                    </div>
                    <div>
                      <label className="mb-1.5 block text-sm font-medium text-slate-700">Harga Satuan (Rp)</label>
                      <input
                        type="text"
                        inputMode="numeric"
                        value={detailForm.harga_satuan}
                        onChange={(event) =>
                          setDetailForm((previous) => ({
                            ...previous,
                            harga_satuan: formatRupiahInput(event.target.value),
                          }))
                        }
                        className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                        placeholder="Contoh: 10.000"
                      />
                    </div>
                  </div>

                  <div className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700">
                    Jumlah Harga: <span className="font-semibold text-slate-900">{formatRupiah(Math.round(detailSubtotal))}</span>
                  </div>

                  <div className="flex justify-end gap-2 pt-1">
                    {editingDetailId && (
                      <button
                        type="button"
                        onClick={resetDetailEditor}
                        className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                      >
                        Batal Edit
                      </button>
                    )}
                    <button
                      type="submit"
                      disabled={detailsSaving}
                      className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
                    >
                      {detailsSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                      {editingDetailId ? 'Update Detail' : 'Simpan Detail'}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
