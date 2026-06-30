import { useState } from 'react';
import { Download, FileText, Building, DoorOpen, Package, Wallet, Layers, TrendingUp, Printer, Save, CheckCircle2, Loader2 } from 'lucide-react';
import type { Floor, ProjectState } from '../types';
import { formatRupiah, CATEGORY_COLORS } from '../data';
import { CategoryBadge } from './CategoryBadge';

interface SummaryStepProps {
  project: ProjectState;
  floors: Floor[];
  onBack: () => void;
  onRestart: () => void;
  onSaveRab: () => Promise<{ success: boolean; error: string | null }>;
}

export function SummaryStep({ project, floors, onBack, onRestart, onSaveRab }: SummaryStepProps) {
  const [expandedFloor, setExpandedFloor] = useState<string | null>(floors[0]?.id ?? null);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [saveError, setSaveError] = useState<string | null>(null);

  const allParts = floors.flatMap((f) =>
    f.rooms.flatMap((r) => r.parts.map((p) => ({ ...p, floorName: f.name, roomName: r.name }))),
  );

  const grandTotal = allParts.reduce((s, p) => s + p.quantity * p.price, 0);
  const totalRooms = floors.reduce((s, f) => s + f.rooms.length, 0);
  const totalParts = allParts.length;
  const totalQty = allParts.reduce((s, p) => s + p.quantity, 0);

  // by category
  const byCategory = allParts.reduce((acc, p) => {
    const key = p.category;
    if (!acc[key]) acc[key] = { count: 0, subtotal: 0 };
    acc[key].count += p.quantity;
    acc[key].subtotal += p.quantity * p.price;
    return acc;
  }, {} as Record<string, { count: number; subtotal: number }>);

  const handlePrint = () => window.print();

  const handleSave = async () => {
    setSaveState('saving');
    setSaveError(null);
    const result = await onSaveRab();
    if (result.success) {
      setSaveState('saved');
      setTimeout(() => setSaveState('idle'), 3000);
    } else {
      setSaveState('error');
      setSaveError(result.error);
      setTimeout(() => setSaveState('idle'), 5000);
    }
  };

  return (
    <div className="animate-fade-in space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Ringkasan RAB Kelistrikan</h2>
          <p className="mt-1 text-sm text-slate-500">Rekapitulasi seluruh komponen dari semua lantai & ruangan.</p>
        </div>
        <div className="flex flex-wrap gap-2 print:hidden">
          <button className="btn-secondary" onClick={handlePrint}>
            <Printer className="h-4 w-4" />
            Cetak
          </button>
          <button className="btn-secondary" onClick={handlePrint}>
            <Download className="h-4 w-4" />
            Export PDF
          </button>
          <button
            className="btn-primary"
            onClick={handleSave}
            disabled={saveState === 'saving' || saveState === 'saved'}
          >
            {saveState === 'saving' && <Loader2 className="h-4 w-4 animate-spin" />}
            {saveState === 'saved' && <CheckCircle2 className="h-4 w-4" />}
            {saveState === 'idle' && <Save className="h-4 w-4" />}
            {saveState === 'error' && <Save className="h-4 w-4" />}
            {saveState === 'saving' ? 'Menyimpan...' : saveState === 'saved' ? 'Tersimpan!' : 'Simpan RAB'}
          </button>
        </div>
      </div>

      {saveState === 'error' && saveError && (
        <div className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700 animate-fade-in">
          Gagal menyimpan: {saveError}
        </div>
      )}
      {saveState === 'saved' && (
        <div className="flex items-center gap-2 rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700 animate-fade-in">
          <CheckCircle2 className="h-4 w-4" />
          RAB berhasil disimpan ke database. Anda dapat melihatnya kembali nanti.
        </div>
      )}

      {/* Project header card */}
      <div className="card-base overflow-hidden">
        <div className="bg-gradient-to-br from-brand-700 to-brand-900 px-6 py-5 text-white">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-xs font-medium uppercase tracking-wider text-brand-200">Rencana Anggaran Biaya</div>
              <h3 className="mt-1 text-xl font-bold">{project.name || 'Project Tanpa Nama'}</h3>
              <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-sm text-brand-100">
                {project.client && <span>Klien: {project.client}</span>}
                {project.location && <span>Lokasi: {project.location}</span>}
                {project.date && <span>Tanggal: {new Date(project.date).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}</span>}
              </div>
            </div>
            <div className="text-right">
              <div className="text-xs text-brand-200">Total Anggaran</div>
              <div className="text-2xl font-bold">{formatRupiah(grandTotal)}</div>
            </div>
          </div>
        </div>
        <div className="grid grid-cols-2 divide-x divide-slate-100 sm:grid-cols-4">
          <Stat icon={<Layers className="h-4 w-4" />} label="Lantai" value={floors.length} />
          <Stat icon={<DoorOpen className="h-4 w-4" />} label="Ruangan" value={totalRooms} />
          <Stat icon={<Package className="h-4 w-4" />} label="Jenis Komponen" value={totalParts} />
          <Stat icon={<TrendingUp className="h-4 w-4" />} label="Total Unit" value={totalQty} />
        </div>
      </div>

      {/* Category breakdown */}
      <div className="card-base p-5">
        <h3 className="mb-4 flex items-center gap-2 font-semibold text-slate-700">
          <Wallet className="h-4 w-4 text-brand-600" />
          Rincian per Kategori
        </h3>
        <div className="space-y-3">
          {Object.entries(byCategory)
            .sort((a, b) => b[1].subtotal - a[1].subtotal)
            .map(([cat, data]) => {
              const pct = (data.subtotal / grandTotal) * 100;
              const colors = CATEGORY_COLORS[cat as keyof typeof CATEGORY_COLORS];
              return (
                <div key={cat}>
                  <div className="mb-1 flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <CategoryBadge category={cat as keyof typeof CATEGORY_COLORS} size="sm" />
                      <span className="text-slate-500">{data.count} unit</span>
                    </div>
                    <span className="font-semibold text-slate-800">{formatRupiah(data.subtotal)}</span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
                    <div
                      className={`h-full rounded-full ${colors.dot} transition-all duration-700`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
        </div>
      </div>

      {/* Per-floor breakdown */}
      <div className="space-y-3">
        <h3 className="flex items-center gap-2 font-semibold text-slate-700">
          <Building className="h-4 w-4 text-brand-600" />
          Rincian per Lantai
        </h3>
        {floors.map((floor) => {
          const floorParts = floor.rooms.flatMap((r) => r.parts.map((p) => ({ ...p, roomName: r.name })));
          const floorTotal = floorParts.reduce((s, p) => s + p.quantity * p.price, 0);
          const isExpanded = expandedFloor === floor.id;
          return (
            <div key={floor.id} className="card-base overflow-hidden">
              <button
                className="flex w-full items-center justify-between px-5 py-4 text-left transition-colors hover:bg-slate-50/60"
                onClick={() => setExpandedFloor(isExpanded ? null : floor.id)}
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-100 text-sm font-bold text-brand-700">
                    {floors.indexOf(floor) + 1}
                  </div>
                  <div>
                    <div className="font-semibold text-slate-800">{floor.name}</div>
                    <div className="text-xs text-slate-500">{floor.rooms.length} ruangan · {floorParts.length} komponen</div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-lg font-bold text-brand-700">{formatRupiah(floorTotal)}</div>
                  <div className="text-xs text-slate-400">{((floorTotal / grandTotal) * 100).toFixed(1)}% dari total</div>
                </div>
              </button>
              {isExpanded && (
                <div className="border-t border-slate-100 animate-fade-in">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-slate-50/60 text-left text-xs uppercase tracking-wide text-slate-500">
                          <th className="px-5 py-2.5 font-semibold">Ruangan</th>
                          <th className="px-3 py-2.5 font-semibold">Komponen</th>
                          <th className="px-3 py-2.5 font-semibold">Kategori</th>
                          <th className="px-3 py-2.5 text-center font-semibold">Qty</th>
                          <th className="px-3 py-2.5 text-right font-semibold">Harga</th>
                          <th className="px-3 py-2.5 text-right font-semibold">Subtotal</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50">
                        {floorParts.map((p) => (
                          <tr key={p.id} className="hover:bg-slate-50/40">
                            <td className="px-5 py-2.5 text-slate-600">{p.roomName}</td>
                            <td className="px-3 py-2.5 font-medium text-slate-800">{p.name}</td>
                            <td className="px-3 py-2.5"><CategoryBadge category={p.category} size="sm" /></td>
                            <td className="px-3 py-2.5 text-center text-slate-600">{p.quantity} {p.unit}</td>
                            <td className="px-3 py-2.5 text-right text-slate-600">{formatRupiah(p.price)}</td>
                            <td className="px-3 py-2.5 text-right font-semibold text-slate-900">{formatRupiah(p.quantity * p.price)}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="border-t-2 border-slate-100 bg-slate-50/60">
                          <td colSpan={5} className="px-5 py-3 text-right font-semibold text-slate-600">Total {floor.name}:</td>
                          <td className="px-3 py-3 text-right font-bold text-brand-700">{formatRupiah(floorTotal)}</td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Grand total */}
      <div className="card-base overflow-hidden">
        <div className="flex flex-col items-center justify-between gap-4 bg-gradient-to-r from-slate-900 to-slate-800 px-6 py-6 text-white sm:flex-row">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/10">
              <Wallet className="h-6 w-6" />
            </div>
            <div>
              <div className="text-sm text-slate-300">Total Keseluruhan RAB Kelistrikan</div>
              <div className="text-xs text-slate-400">{project.name}</div>
            </div>
          </div>
          <div className="text-3xl font-bold sm:text-4xl">{formatRupiah(grandTotal)}</div>
        </div>
      </div>

      <div className="flex justify-between print:hidden">
        <button className="btn-secondary" onClick={onBack}>
          Kembali
        </button>
        <button className="btn-ghost" onClick={onRestart}>
          <FileText className="h-4 w-4" />
          Buat Project Baru
        </button>
      </div>
    </div>
  );
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <div className="px-5 py-4">
      <div className="flex items-center gap-1.5 text-xs text-slate-500">
        {icon}
        {label}
      </div>
      <div className="mt-1 text-xl font-bold text-slate-900">{value}</div>
    </div>
  );
}
