import { useState } from 'react';
import { Download, FileText, Building, DoorOpen, Package, Wallet, Layers, TrendingUp, Save, CheckCircle2, Loader2, AlertCircle, Edit } from 'lucide-react';
import * as ExcelJS from 'exceljs';
import type { Floor, ProjectState } from '../types';
import { formatRupiah, CATEGORY_COLORS } from '../data';
import { CategoryBadge } from './CategoryBadge';
import { supabase } from '../lib/supabase';
import { getBiayaUmumKoef } from '../lib/biayaUmumSetting';

type AhspDetailType = 'A. Tenaga kerja' | 'B. Bahan' | 'C. Peralatan';

interface AhspDetailRow {
  id: string;
  component_id: string;
  jenis: AhspDetailType;
  uraian: string;
  satuan: string;
  koefisien: number | string;
  harga_satuan: number | string;
  jumlah_harga: number | string;
}

const AHSP_DETAIL_TYPES: AhspDetailType[] = ['A. Tenaga kerja', 'B. Bahan', 'C. Peralatan'];

interface SummaryStepProps {
  project: ProjectState;
  floors: Floor[];
  onBack: () => void;
  onEditProject: () => void;
  onEditComponents: () => void;
  onRestart: () => void;
  onSaveProject: () => Promise<{ success: boolean; error: string | null }>;
  onSaveRab: () => Promise<{ success: boolean; error: string | null }>;
}

export function SummaryStep({ project, floors, onBack, onEditProject, onEditComponents, onRestart, onSaveProject, onSaveRab }: SummaryStepProps) {
  const [expandedFloor, setExpandedFloor] = useState<string | null>(floors[0]?.id ?? null);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [saveError, setSaveError] = useState<string | null>(null);
  const [exportState, setExportState] = useState<'idle' | 'exporting' | 'exported' | 'error'>('idle');
  const [exportError, setExportError] = useState<string | null>(null);

  const allParts = floors.flatMap((f) =>
    f.rooms.flatMap((r) => r.parts.map((p) => ({ ...p, floorName: f.name, roomName: r.name }))),
  );

  const grandTotal = allParts.reduce((s, p) => s + p.quantity * p.price, 0);
  const totalRooms = floors.reduce((s, f) => s + f.rooms.length, 0);
  const totalParts = allParts.length;
  const totalQty = allParts.reduce((s, p) => s + p.quantity, 0);
  const floorsWithoutRooms = floors.filter((floor) => floor.rooms.length === 0);
  const roomsWithoutParts = floors.flatMap((floor) =>
    floor.rooms
      .filter((room) => room.parts.length === 0)
      .map((room) => ({ floorName: floor.name, roomName: room.name })),
  );
  const hasIncompleteData = !project.name.trim() || floors.length === 0 || floorsWithoutRooms.length > 0 || roomsWithoutParts.length > 0;

  const exportFilename = `RAB-${(project.name || 'Project Tanpa Nama')
    .replace(/[^a-zA-Z0-9-_]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')}-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.xlsx`;

  const componentSummary = Object.values(
    allParts.reduce((acc, part) => {
      const key = part.componentId || `${part.name}-${part.category}-${part.unit}-${part.price}`;
      if (!acc[key]) {
        acc[key] = {
          componentId: part.componentId,
          name: part.name,
          category: part.category,
          unit: part.unit,
          price: part.price,
          quantity: 0,
          subtotal: 0,
        };
      }

      acc[key].quantity += part.quantity;
      acc[key].subtotal += part.quantity * part.price;
      return acc;
    }, {} as Record<string, { componentId: string; name: string; category: string; unit: string; price: number; quantity: number; subtotal: number }>),
  ).sort((a, b) => b.subtotal - a.subtotal);

  // by category
  const byCategory = allParts.reduce((acc, p) => {
    const key = p.category;
    if (!acc[key]) acc[key] = { count: 0, subtotal: 0 };
    acc[key].count += p.quantity;
    acc[key].subtotal += p.quantity * p.price;
    return acc;
  }, {} as Record<string, { count: number; subtotal: number }>);

  const handleExportExcel = async () => {
    if (exportState === 'exporting') return;
    setExportState('exporting');
    setExportError(null);

    try {
    const saveResult = await onSaveProject();
    if (!saveResult.success) {
      throw new Error(saveResult.error || 'Proyek gagal disimpan sebelum export Excel.');
    }
    const componentIds = [...new Set(componentSummary.map((item) => item.componentId).filter(Boolean))];
    const [{ data: detailData, error: detailError }, biayaUmumKoef] = await Promise.all([
      componentIds.length > 0
        ? supabase
            .from('detail_komponen')
            .select('id, component_id, jenis, uraian, satuan, koefisien, harga_satuan, jumlah_harga')
            .in('component_id', componentIds)
            .order('created_at', { ascending: true })
        : Promise.resolve({ data: [], error: null }),
      getBiayaUmumKoef(),
    ]);
    if (detailError) throw new Error(`Detail AHSP gagal dimuat: ${detailError.message}`);
    const ahspDetails = (detailData ?? []) as AhspDetailRow[];

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'VoltRAB';
    workbook.created = new Date();
    workbook.modified = new Date();
    workbook.properties.date1904 = false;

    const colors = {
      navy: '1E3A8A',
      blue: '2563EB',
      sky: '0EA5E9',
      green: '16A34A',
      amber: 'D97706',
      slate: '64748B',
      soft: 'F8FAFC',
      border: 'CBD5E1',
      white: 'FFFFFF',
    };

    const thinBorder = {
      top: { style: 'thin' as const, color: { argb: colors.border } },
      left: { style: 'thin' as const, color: { argb: colors.border } },
      bottom: { style: 'thin' as const, color: { argb: colors.border } },
      right: { style: 'thin' as const, color: { argb: colors.border } },
    };

    const moneyFormat = 'Rp #,##0';

    const setTitleRow = (sheet: ExcelJS.Worksheet, title: string, subtitle?: string) => {
      sheet.mergeCells('A1:I1');
      sheet.getCell('A1').value = title;
      sheet.getCell('A1').font = { bold: true, size: 16, color: { argb: colors.white } };
      sheet.getCell('A1').alignment = { horizontal: 'center', vertical: 'middle' };
      sheet.getCell('A1').fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: colors.navy },
      };
      sheet.getRow(1).height = 24;

      if (subtitle) {
        sheet.mergeCells('A2:I2');
        sheet.getCell('A2').value = subtitle;
        sheet.getCell('A2').font = { italic: true, color: { argb: colors.slate } };
        sheet.getCell('A2').alignment = { horizontal: 'center', vertical: 'middle' };
        sheet.getCell('A2').fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: colors.soft },
        };
        sheet.getRow(2).height = 20;
      }
    };

    const styleHeader = (row: ExcelJS.Row, fillColor: string) => {
      row.height = 20;
      row.eachCell((cell) => {
        cell.font = { bold: true, color: { argb: colors.white } };
        cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: fillColor },
        };
        cell.border = thinBorder;
      });
    };

    const summarySheet = workbook.addWorksheet('Ringkasan', {
      views: [{ state: 'frozen', ySplit: 5 }],
      properties: { tabColor: { argb: colors.blue } },
    });
    setTitleRow(summarySheet, 'Ringkasan RAB Kelistrikan', 'Export otomatis dari VoltRAB');
    summarySheet.columns = [
      { key: 'label', width: 24 },
      { key: 'value', width: 42 },
    ];

    const generatedAt = new Date();
    const summaryRows = [
      { label: 'Project', value: project.name || 'Project Tanpa Nama' },
      { label: 'Klien', value: project.client || '-' },
      { label: 'Lokasi', value: project.location || '-' },
      { label: 'Tanggal', value: project.date ? new Date(project.date).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }) : '-' },
      { label: 'Dibuat', value: generatedAt.toLocaleString('id-ID') },
      { label: 'Total Lantai', value: floors.length },
      { label: 'Total Ruangan', value: totalRooms },
      { label: 'Total Jenis Komponen', value: totalParts },
      { label: 'Total Unit', value: totalQty },
      { label: 'Total Anggaran', value: grandTotal },
    ];

    summarySheet.addRow(['Informasi', 'Nilai']);
    styleHeader(summarySheet.getRow(4), colors.blue);
    summaryRows.forEach((item, index) => {
      const row = summarySheet.addRow([item.label, item.value]);
      row.getCell(1).font = { bold: true, color: { argb: colors.navy } };
      row.getCell(2).alignment = { vertical: 'middle' };
      if (item.label === 'Total Anggaran') {
        row.getCell(2).font = { bold: true, color: { argb: colors.green } };
        row.getCell(2).numFmt = moneyFormat;
      }
      if (typeof item.value === 'number' && item.label !== 'Total Anggaran') {
        row.getCell(2).numFmt = '0';
      }
      row.eachCell((cell) => {
        cell.border = thinBorder;
        if (index % 2 === 0) {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'F8FAFC' } };
        }
      });
    });
    summarySheet.getCell('A14').value = 'Catatan';
    summarySheet.getCell('B14').value = 'Sheet ini berisi ringkasan proyek dan total anggaran.';
    summarySheet.getCell('A14').font = { bold: true, color: { argb: colors.amber } };
    summarySheet.getCell('B14').font = { italic: true, color: { argb: colors.slate } };
    summarySheet.getCell('A14').border = thinBorder;
    summarySheet.getCell('B14').border = thinBorder;
    summarySheet.getCell('A14').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF7ED' } };
    summarySheet.getCell('B14').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF7ED' } };

    const componentSheet = workbook.addWorksheet('Komponen', {
      views: [{ state: 'frozen', ySplit: 4 }],
      properties: { tabColor: { argb: colors.sky } },
    });
    setTitleRow(componentSheet, 'Tabel Komponen', 'Rekap komponen yang sudah digabung berdasarkan nama dan kategori');
    componentSheet.columns = [
      { key: 'no', width: 6 },
      { key: 'komponen', width: 32 },
      { key: 'kategori', width: 22 },
      { key: 'satuan', width: 12 },
      { key: 'qty', width: 10 },
      { key: 'harga', width: 18 },
      { key: 'subtotal', width: 18 },
    ];
    componentSheet.addRow(['No', 'Komponen', 'Kategori', 'Satuan', 'Qty', 'Harga Satuan', 'Subtotal']);
    styleHeader(componentSheet.getRow(4), colors.sky);
    const componentRows = new Map<string, ExcelJS.Row>();
    componentSummary.forEach((item, index) => {
      const row = componentSheet.addRow([
        index + 1,
        item.name,
        item.category,
        item.unit,
        item.quantity,
        item.price,
        item.subtotal,
      ]);
      row.getCell(5).numFmt = '0';
      row.getCell(6).numFmt = moneyFormat;
      row.getCell(7).numFmt = moneyFormat;
      row.getCell(2).font = { bold: true };
      componentRows.set(item.componentId, row);
      row.eachCell((cell) => {
        cell.border = thinBorder;
        if (index % 2 === 0) {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'F8FAFC' } };
        }
      });
    });
    const componentTotalRow = componentSheet.addRow(['', 'TOTAL', '', '', totalQty, '', grandTotal]);
    componentTotalRow.getCell(2).font = { bold: true, color: { argb: colors.white } };
    componentTotalRow.getCell(5).numFmt = '0';
    componentTotalRow.getCell(7).numFmt = moneyFormat;
    componentTotalRow.eachCell((cell) => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: colors.navy } };
      cell.font = { bold: true, color: { argb: colors.white } };
      cell.border = thinBorder;
    });

    const detailSheet = workbook.addWorksheet('Detail Komponen', {
      views: [{ state: 'frozen', ySplit: 4 }],
      properties: { tabColor: { argb: colors.amber } },
    });
    setTitleRow(detailSheet, 'Detail Komponen', 'Analisis Harga Satuan Pekerjaan (AHSP) komponen yang dipasang');
    detailSheet.columns = [
      { key: 'no', width: 6 },
      { key: 'uraian', width: 48 },
      { key: 'satuan', width: 12 },
      { key: 'koefisien', width: 14 },
      { key: 'harga', width: 19 },
      { key: 'jumlah', width: 19 },
    ];

    const detailAnchors = new Map<string, number>();
    componentSummary.forEach((component, componentIndex) => {
      if (componentIndex > 0) detailSheet.addRow([]);
      const anchorRow = detailSheet.rowCount + 1;
      detailAnchors.set(component.componentId, anchorRow);
      detailSheet.mergeCells(anchorRow, 1, anchorRow, 6);
      const componentTitle = detailSheet.getCell(anchorRow, 1);
      componentTitle.value = `${componentIndex + 1}. ${component.name}`;
      componentTitle.font = { bold: true, size: 12, color: { argb: colors.white } };
      componentTitle.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: colors.navy } };
      componentTitle.alignment = { vertical: 'middle' };
      detailSheet.getRow(anchorRow).height = 22;

      const header = detailSheet.addRow(['No', 'Uraian', 'Satuan', 'Koefisien', 'Harga Satuan', 'Jumlah Harga']);
      styleHeader(header, colors.amber);
      const rows = ahspDetails.filter((detail) => detail.component_id === component.componentId);

      if (rows.length === 0) {
        const emptyRow = detailSheet.addRow(['', 'Detail AHSP belum tersedia untuk komponen ini.', '', '', '', '']);
        emptyRow.getCell(2).font = { italic: true, color: { argb: colors.slate } };
        emptyRow.eachCell((cell) => { cell.border = thinBorder; });
      } else {
        let detailNumber = 1;
        AHSP_DETAIL_TYPES.forEach((type) => {
          const groupRow = detailSheet.addRow(['', type, '', '', '', '']);
          detailSheet.mergeCells(groupRow.number, 2, groupRow.number, 6);
          groupRow.getCell(2).font = { bold: true, color: { argb: colors.navy } };
          groupRow.getCell(2).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'E2E8F0' } };
          groupRow.eachCell((cell) => { cell.border = thinBorder; });

          rows.filter((detail) => detail.jenis === type).forEach((detail) => {
            const row = detailSheet.addRow([
              detailNumber,
              detail.uraian,
              detail.satuan,
              Number(detail.koefisien),
              Number(detail.harga_satuan),
              Number(detail.jumlah_harga),
            ]);
            detailNumber += 1;
            row.getCell(4).numFmt = '0.0000';
            row.getCell(5).numFmt = moneyFormat;
            row.getCell(6).numFmt = moneyFormat;
            row.eachCell((cell) => { cell.border = thinBorder; });
          });
        });
      }

      const dTotal = rows.reduce((sum, detail) => sum + Number(detail.jumlah_harga || 0), 0);
      const eTotal = dTotal * biayaUmumKoef;
      const totals = [
        ['D. Jumlah A + B + C', '', '', '', dTotal],
        ['E. Biaya Umum dan Keuntungan', '', `${biayaUmumKoef * 100}%`, '', eTotal],
        ['F. Harga Satuan Pekerjaan (D + E)', '', '', '', dTotal + eTotal],
      ];
      totals.forEach((values, index) => {
        const row = detailSheet.addRow(['', ...values]);
        row.getCell(2).font = { bold: true, color: { argb: index === 2 ? colors.green : colors.navy } };
        row.getCell(6).numFmt = moneyFormat;
        row.eachCell((cell) => {
          cell.border = thinBorder;
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: index === 2 ? 'ECFDF5' : 'F8FAFC' } };
        });
      });
    });

    componentSummary.forEach((component) => {
      const row = componentRows.get(component.componentId);
      const anchor = detailAnchors.get(component.componentId);
      if (!row || !anchor) return;
      row.getCell(6).value = {
        text: formatRupiah(component.price),
        hyperlink: `#'Detail Komponen'!A${anchor}`,
        tooltip: `Buka detail AHSP ${component.name}`,
      };
      row.getCell(6).font = { color: { argb: colors.blue }, underline: true };
      row.getCell(6).alignment = { horizontal: 'right' };
    });

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = exportFilename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    setExportState('exported');
    window.setTimeout(() => setExportState('idle'), 4000);
    } catch (error) {
      setExportState('error');
      setExportError(error instanceof Error ? error.message : 'File Excel gagal dibuat.');
    }
  };

  const handleSave = async () => {
    setSaveState('saving');
    setSaveError(null);
    try {
      const result = await onSaveRab();
      if (result.success) {
        setSaveState('saved');
        setTimeout(() => setSaveState('idle'), 3000);
      } else {
        setSaveState('error');
        setSaveError(result.error);
        setTimeout(() => setSaveState('idle'), 5000);
      }
    } catch (error) {
      setSaveState('error');
      setSaveError(error instanceof Error ? error.message : 'Terjadi kesalahan saat menyimpan RAB.');
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
          <button className="btn-secondary" onClick={() => void handleExportExcel()} disabled={exportState === 'exporting'}>
            {exportState === 'exporting' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            {exportState === 'exporting' ? 'Membuat Excel...' : 'Export Excel'}
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

      {hasIncompleteData && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4" role="status">
          <div className="flex items-start gap-3">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-amber-900">Ada data yang belum lengkap</p>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-amber-800">
                {!project.name.trim() && <li>Nama project belum diisi.</li>}
                {floors.length === 0 && <li>Belum ada lantai.</li>}
                {floorsWithoutRooms.length > 0 && <li>{floorsWithoutRooms.length} lantai belum memiliki ruangan.</li>}
                {roomsWithoutParts.length > 0 && <li>{roomsWithoutParts.length} ruangan belum memiliki komponen.</li>}
              </ul>
              <div className="mt-3 flex flex-wrap gap-2 print:hidden">
                {!project.name.trim() && (
                  <button type="button" className="btn-secondary" onClick={onEditProject}>
                    <Edit className="h-4 w-4" /> Edit Project
                  </button>
                )}
                {(floors.length === 0 || floorsWithoutRooms.length > 0 || roomsWithoutParts.length > 0) && (
                  <button type="button" className="btn-secondary" onClick={onEditComponents}>
                    <Edit className="h-4 w-4" /> Edit Komponen
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {exportState === 'exported' && (
        <div className="flex items-center gap-2 rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700" role="status">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          File <span className="font-semibold">{exportFilename}</span> berhasil dibuat dan diunduh.
        </div>
      )}
      {exportState === 'error' && exportError && (
        <div className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700" role="alert">
          Gagal export Excel: {exportError}
        </div>
      )}

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
          {Object.keys(byCategory).length === 0 && (
            <div className="rounded-xl border-2 border-dashed border-slate-200 px-4 py-8 text-center">
              <Package className="mx-auto h-9 w-9 text-slate-300" />
              <p className="mt-2 text-sm font-medium text-slate-600">Belum ada komponen untuk diringkas.</p>
              <button type="button" className="btn-secondary mt-4 print:hidden" onClick={onEditComponents}>Tambah Komponen</button>
            </div>
          )}
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
                  <div className="text-xs text-slate-400">{(grandTotal ? (floorTotal / grandTotal) * 100 : 0).toFixed(1)}% dari total</div>
                </div>
              </button>
              {isExpanded && (
                <div className="border-t border-slate-100 animate-fade-in">
                  <div className="overflow-x-auto" tabIndex={0} aria-label={`Rincian komponen ${floor.name}.`}>
                    <table className="summary-components-table min-w-[760px] w-full text-sm">
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
