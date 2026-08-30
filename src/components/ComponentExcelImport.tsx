import { useRef, useState, type ChangeEvent } from 'react';
import { createPortal } from 'react-dom';
import { AlertCircle, CheckCircle2, FileSpreadsheet, Loader2, Upload, X } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { getBiayaUmumKoef } from '../lib/biayaUmumSetting';
import type { PartCategory } from '../types';

type DetailJenis = 'A. Tenaga kerja' | 'B. Bahan' | 'C. Peralatan';

interface ImportedDetail {
  jenis: DetailJenis;
  uraian: string;
  satuan: string;
  koefisien: number;
  hargaSatuan: number;
}

interface ImportedComponent {
  id: string;
  sourceCode: string;
  name: string;
  category: PartCategory;
  unit: string;
  details: ImportedDetail[];
}

interface ComponentExcelImportProps {
  onImported: () => Promise<void> | void;
}

const SECTION_MAP: Record<string, DetailJenis> = {
  A: 'A. Tenaga kerja',
  B: 'B. Bahan',
  C: 'C. Peralatan',
};

const textValue = (value: unknown) => String(value ?? '').replace(/\s+/g, ' ').trim();

const numberValue = (value: unknown): number => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const cleaned = textValue(value).replace(/[^\d,.-]/g, '');
  if (!cleaned) return 0;

  // File AHSP memakai koma sebagai pemisah ribuan dan titik sebagai desimal.
  const normalized = cleaned.includes('.') ? cleaned.replace(/,/g, '') : cleaned.replace(',', '.');
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
};

const componentId = (code: string) => `ahsp-${code.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`;

const inferUnit = (name: string): string => {
  const normalized = name.toLowerCase();
  const match = normalized.match(/\b1\s*(m3|m³|m2|m²|m'|meter|titik|buah|unit|set|ls|kg)\b/i);
  if (!match) return 'unit';
  const unit = match[1].toLowerCase();
  if (unit === 'm³') return 'm3';
  if (unit === 'm²') return 'm2';
  if (unit === "m'" || unit === 'meter') return 'm';
  return unit;
};

const inferCategory = (name: string): PartCategory => {
  const normalizedName = name.toLowerCase().replace(/[-_/]+/g, ' ');

  // Fungsi utama komponen menang dari material pendukung yang disebut di namanya.
  // Contoh: "Instalasi Stop Kontak (Kabel LSOH)" tetap Stop Kontak, bukan Kabel.
  if (/\b(saklar|switch|stop\s*kontak|stopkontak|socket|wall\s*outlet|power\s*outlet|outlet\s*(data|telepon|telephone))\b/i.test(normalizedName)) {
    return 'Saklar & Stop Kontak';
  }
  if (/\b(lampu|lamp|led|penerangan|cahaya|armatur|luminaire|lighting|tled|pju|fitting|ballast|downlight|down\s*light|floodlight|flood\s*light|spotlight|high\s*bay|emergency\s*light)\b/i.test(normalizedName)) {
    return 'Penerangan';
  }
  if (/\b(mcb|mccb|acb|elcb|rcd|rcbo|nfb|cb|circuit\s*breaker|pemutus|sekring|fuse|arrester|surge|grounding|pentanahan|proteksi|pengaman|earth\s*leakage)\b/i.test(normalizedName)) {
    return 'Pengaman';
  }
  if (/\b(kabel|cable|nyy|nym|nyaf|n2x|n2xy|n2xsy|xlpe|ls[o0]h|konduit|conduit|tray|ladder|duct|busduct|busway)\b/i.test(normalizedName)) {
    return 'Kabel';
  }
  return 'Lainnya';
};

const parseWorkbook = async (file: File): Promise<ImportedComponent[]> => {
  const XLSX = await import('xlsx');
  const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array', cellFormula: true });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw new Error('File Excel tidak memiliki sheet.');

  const rows = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[sheetName], {
    header: 1,
    defval: null,
    raw: true,
  });

  const parsed: ImportedComponent[] = [];
  let active: ImportedComponent | null = null;
  let activeSection: DetailJenis | null = null;

  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index] ?? [];
    const first = textValue(row[0]);
    const second = textValue(row[1]);

    if (first.toLowerCase() === 'no' && second.toLowerCase() === 'uraian') {
      let heading: unknown[] | undefined;
      for (let offset = 1; offset <= 3; offset += 1) {
        const candidate = rows[index - offset];
        if (candidate && /^\d+(?:\.\d+)+\.?$/.test(textValue(candidate[0])) && textValue(candidate[1])) {
          heading = candidate;
          break;
        }
      }

      if (heading) {
        const code = textValue(heading[0]).replace(/\.$/, '');
        const name = textValue(heading[1]);
        active = {
          id: componentId(code),
          sourceCode: code,
          name,
          category: 'Lainnya',
          unit: inferUnit(name),
          details: [],
        };
        parsed.push(active);
      } else {
        active = null;
      }
      activeSection = null;
      continue;
    }

    if (SECTION_MAP[first]) {
      activeSection = SECTION_MAP[first];
      continue;
    }

    if (!active || !activeSection || !/^\d+$/.test(first)) continue;

    const uraian = second;
    const satuan = textValue(row[2]);
    const koefisien = numberValue(row[3]);
    const hargaSatuan = Math.round(numberValue(row[4]));
    if (!uraian || !satuan || koefisien < 0 || hargaSatuan < 0) continue;

    active.details.push({ jenis: activeSection, uraian, satuan, koefisien, hargaSatuan });
  }

  const unique = Array.from(new Map(parsed.map((component) => [component.id, component])).values());
  const valid = unique
    .filter((component) => component.details.length > 0)
    .map((component) => ({
      ...component,
      category: inferCategory(component.name),
    }));
  if (valid.length === 0) {
    throw new Error('Tidak ada blok komponen AHSP yang dapat dibaca dari file ini.');
  }
  return valid;
};

const chunk = <T,>(items: T[], size: number): T[][] => {
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += size) result.push(items.slice(index, index + size));
  return result;
};

export function ComponentExcelImport({ onImported }: ComponentExcelImportProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState('');
  const [components, setComponents] = useState<ImportedComponent[]>([]);
  const [reading, setReading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const close = () => {
    if (importing) return;
    setComponents([]);
    setFileName('');
    setError(null);
    setSuccess(null);
    if (inputRef.current) inputRef.current.value = '';
  };

  const handleFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setReading(true);
    setError(null);
    setSuccess(null);
    setFileName(file.name);

    try {
      setComponents(await parseWorkbook(file));
    } catch (parseError) {
      setComponents([]);
      setError(parseError instanceof Error ? parseError.message : 'Gagal membaca file Excel.');
    } finally {
      setReading(false);
    }
  };

  const handleImport = async () => {
    if (components.length === 0) return;
    setImporting(true);
    setError(null);
    setSuccess(null);

    try {
      const { data: userResult, error: userError } = await supabase.auth.getUser();
      const userId = userResult.user?.id;
      if (userError || !userId) throw new Error('Sesi pengguna tidak ditemukan. Silakan login ulang.');

      const biayaUmumKoef = await getBiayaUmumKoef();
      const componentRows = components.map((component) => {
        const subtotal = component.details.reduce(
          (sum, detail) => sum + detail.koefisien * detail.hargaSatuan,
          0,
        );
        return {
          user_id: userId,
          id: component.id,
          name: component.name,
          category: component.category,
          unit: component.unit,
          price: Math.round(subtotal * (1 + biayaUmumKoef)),
          is_active: true,
          updated_at: new Date().toISOString(),
        };
      });

      for (const rows of chunk(componentRows, 100)) {
        const { error: upsertError } = await supabase
          .from('components')
          .upsert(rows, { onConflict: 'user_id,id' });
        if (upsertError) throw new Error(`Gagal menyimpan komponen: ${upsertError.message}`);
      }

      for (const group of chunk(components.map((component) => component.id), 100)) {
        const { error: deleteError } = await supabase.from('detail_komponen').delete().in('component_id', group);
        if (deleteError) throw new Error(`Gagal memperbarui detail lama: ${deleteError.message}`);
      }

      const detailRows = components.flatMap((component) =>
        component.details.map((detail) => ({
          user_id: userId,
          component_id: component.id,
          jenis: detail.jenis,
          uraian: detail.uraian,
          satuan: detail.satuan,
          koefisien: detail.koefisien,
          harga_satuan: detail.hargaSatuan,
        })),
      );

      for (const rows of chunk(detailRows, 400)) {
        const { error: insertError } = await supabase.from('detail_komponen').insert(rows);
        if (insertError) throw new Error(`Gagal menyimpan detail komponen: ${insertError.message}`);
      }

      await onImported();
      setSuccess(`${components.length} komponen dan ${detailRows.length} detail berhasil diimpor.`);
    } catch (importError) {
      setError(importError instanceof Error ? importError.message : 'Import Excel gagal.');
    } finally {
      setImporting(false);
    }
  };

  const detailCount = components.reduce((sum, component) => sum + component.details.length, 0);
  const categoryCounts = components.reduce<Partial<Record<PartCategory, number>>>((counts, component) => {
    counts[component.category] = (counts[component.category] ?? 0) + 1;
    return counts;
  }, {});
  const modalOpen = reading || components.length > 0 || !!error || !!success;

  return (
    <>
      <input ref={inputRef} type="file" accept=".xlsx,.xls" onChange={handleFile} className="hidden" />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={reading || importing}
        className="inline-flex items-center justify-center gap-2 rounded-lg border border-emerald-200 bg-white px-4 py-2.5 text-sm font-semibold text-emerald-700 shadow-sm transition-colors hover:bg-emerald-50 disabled:opacity-50"
      >
        {reading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
        Import Excel
      </button>

      {modalOpen && createPortal(
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={close} />
          <div className="relative max-h-[calc(100vh-2rem)] w-full max-w-3xl overflow-y-auto rounded-xl bg-white p-6 shadow-xl">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-full bg-emerald-100">
                  <FileSpreadsheet className="h-6 w-6 text-emerald-700" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-slate-900">Import Komponen dari Excel</h3>
                  <p className="text-sm text-slate-500">{fileName || 'Membaca file...'}</p>
                </div>
              </div>
              <button type="button" onClick={close} disabled={importing} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100">
                <X className="h-5 w-5" />
              </button>
            </div>

            {reading && (
              <div className="flex items-center justify-center gap-3 py-12 text-sm text-slate-600">
                <Loader2 className="h-6 w-6 animate-spin text-emerald-600" /> Membaca struktur AHSP...
              </div>
            )}

            {error && (
              <div className="mt-5 flex items-start gap-2 rounded-lg bg-rose-50 p-3 text-sm text-rose-700">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> {error}
              </div>
            )}

            {success && (
              <div className="mt-5 flex items-start gap-2 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-700">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> {success}
              </div>
            )}

            {!reading && components.length > 0 && !success && (
              <>
                <div className="mt-5 grid grid-cols-2 gap-3">
                  <div className="rounded-lg bg-slate-50 p-4">
                    <div className="text-2xl font-bold text-slate-900">{components.length}</div>
                    <div className="text-sm text-slate-500">Komponen terbaca</div>
                  </div>
                  <div className="rounded-lg bg-slate-50 p-4">
                    <div className="text-2xl font-bold text-slate-900">{detailCount}</div>
                    <div className="text-sm text-slate-500">Detail A/B/C terbaca</div>
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  {Object.entries(categoryCounts).map(([category, count]) => (
                    <span key={category} className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">
                      {category}: {count}
                    </span>
                  ))}
                </div>

                <div className="mt-4 overflow-hidden rounded-xl border border-slate-200">
                  <div className="border-b border-slate-200 bg-slate-50 px-4 py-2 text-xs font-semibold uppercase text-slate-600">Preview</div>
                  {components.slice(0, 5).map((component) => (
                    <div key={component.id} className="flex items-start justify-between gap-4 border-b border-slate-100 px-4 py-3 last:border-0">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium text-slate-900">{component.name}</div>
                        <div className="text-xs text-slate-500">{component.sourceCode} · {component.category} · {component.unit}</div>
                      </div>
                      <span className="shrink-0 text-xs font-medium text-slate-600">{component.details.length} detail</span>
                    </div>
                  ))}
                </div>
                <p className="mt-3 text-xs text-slate-500">
                  Komponen dengan kode AHSP yang sama akan diperbarui dan detail lamanya akan diganti.
                </p>
              </>
            )}

            <div className="mt-6 flex justify-end gap-3">
              <button type="button" onClick={close} disabled={importing} className="rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50">
                {success ? 'Tutup' : 'Batal'}
              </button>
              {!success && components.length > 0 && (
                <button type="button" onClick={() => void handleImport()} disabled={importing} className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50">
                  {importing && <Loader2 className="h-4 w-4 animate-spin" />}
                  {importing ? 'Mengimpor...' : 'Import ke Database'}
                </button>
              )}
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
