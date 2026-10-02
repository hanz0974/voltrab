import { Download, FileSpreadsheet, Loader2, Search, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import * as ExcelJS from 'exceljs';
import { Modal } from './Modal';
import { supabase } from '../lib/supabase';
import { formatRupiah } from '../data';
import { getBiayaUmumKoef } from '../lib/biayaUmumSetting';
import type { Floor } from '../types';
import type { RabReport } from '../lib/useProjectStorage';

interface UserReportsWorkspaceProps { userId: string; }

interface AhspDetailRow {
  component_id: string;
  jenis: 'A. Tenaga kerja' | 'B. Bahan' | 'C. Peralatan';
  uraian: string;
  satuan: string;
  koefisien: number | string;
  harga_satuan: number | string;
  jumlah_harga: number | string;
}

const AHSP_TYPES: AhspDetailRow['jenis'][] = ['A. Tenaga kerja', 'B. Bahan', 'C. Peralatan'];

export function UserReportsWorkspace({ userId }: UserReportsWorkspaceProps) {
  const [reports, setReports] = useState<RabReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<RabReport | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const loadReports = useCallback(async () => {
    setLoading(true);
    const { data, error: loadError } = await supabase.from('rab_reports').select('id, project_name, client, location, project_date, report_data, grand_total, total_items, total_qty, created_at').eq('user_id', userId).order('created_at', { ascending: false });
    if (loadError) { setError(loadError.message); setReports([]); } else { setError(null); setReports((data ?? []) as RabReport[]); }
    setLoading(false);
  }, [userId]);

  useEffect(() => { void loadReports(); }, [loadReports]);
  const filtered = useMemo(() => reports.filter((report) => `${report.project_name} ${report.client ?? ''} ${report.location ?? ''}`.toLowerCase().includes(query.toLowerCase())), [reports, query]);

  const downloadReport = async (report: RabReport) => {
    if (downloadingId) return;
    setDownloadingId(report.id);
    setError(null);

    try {
      const floors = ((report.report_data as { floors?: Floor[] })?.floors ?? []);
      const parts = floors.flatMap((floor) => floor.rooms.flatMap((room) => room.parts));
      const components = Object.values(parts.reduce((acc, part) => {
        const key = part.componentId || `${part.name}-${part.unit}-${part.price}`;
        if (!acc[key]) acc[key] = { componentId: part.componentId, name: part.name, category: part.category, unit: part.unit, price: part.price, quantity: 0, subtotal: 0 };
        acc[key].quantity += part.quantity;
        acc[key].subtotal += part.quantity * part.price;
        return acc;
      }, {} as Record<string, { componentId: string; name: string; category: string; unit: string; price: number; quantity: number; subtotal: number }>));
      const componentIds = [...new Set(components.map((component) => component.componentId).filter(Boolean))];
      const [{ data, error: detailError }, biayaUmumKoef] = await Promise.all([
        componentIds.length
          ? supabase.from('detail_komponen').select('component_id, jenis, uraian, satuan, koefisien, harga_satuan, jumlah_harga').in('component_id', componentIds).order('created_at', { ascending: true })
          : Promise.resolve({ data: [], error: null }),
        getBiayaUmumKoef(),
      ]);
      if (detailError) throw new Error(`Detail AHSP gagal dimuat: ${detailError.message}`);
      const details = (data ?? []) as AhspDetailRow[];

      const workbook = new ExcelJS.Workbook();
      workbook.creator = 'VoltRAB';
      workbook.created = new Date();
      const colors = { navy: '1E3A8A', blue: '2563EB', sky: '0EA5E9', amber: 'D97706', green: '16A34A', slate: '64748B', soft: 'F8FAFC', border: 'CBD5E1', white: 'FFFFFF' };
      const border = { top: { style: 'thin' as const, color: { argb: colors.border } }, left: { style: 'thin' as const, color: { argb: colors.border } }, bottom: { style: 'thin' as const, color: { argb: colors.border } }, right: { style: 'thin' as const, color: { argb: colors.border } } };
      const money = 'Rp #,##0';
      const title = (sheet: ExcelJS.Worksheet, heading: string, subtitle: string) => {
        sheet.mergeCells('A1:I1');
        sheet.getCell('A1').value = heading;
        sheet.getCell('A1').font = { bold: true, size: 16, color: { argb: colors.white } };
        sheet.getCell('A1').alignment = { horizontal: 'center' };
        sheet.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: colors.navy } };
        sheet.mergeCells('A2:I2');
        sheet.getCell('A2').value = subtitle;
        sheet.getCell('A2').font = { italic: true, color: { argb: colors.slate } };
        sheet.getCell('A2').alignment = { horizontal: 'center' };
      };
      const header = (row: ExcelJS.Row, color: string) => row.eachCell((cell) => {
        cell.font = { bold: true, color: { argb: colors.white } };
        cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: color } };
        cell.border = border;
      });

      const summary = workbook.addWorksheet('Ringkasan', { properties: { tabColor: { argb: colors.blue } } });
      title(summary, 'Ringkasan RAB Kelistrikan', 'Export otomatis dari VoltRAB');
      summary.columns = [{ width: 24 }, { width: 42 }];
      summary.addRow(['Informasi', 'Nilai']);
      header(summary.getRow(4), colors.blue);
      [
        ['Project', report.project_name], ['Klien', report.client || '-'], ['Lokasi', report.location || '-'],
        ['Tanggal', report.project_date || '-'], ['Total Lantai', floors.length],
        ['Total Ruangan', floors.reduce((sum, floor) => sum + floor.rooms.length, 0)],
        ['Total Jenis Komponen', components.length], ['Total Unit', report.total_qty], ['Total Anggaran', report.grand_total],
      ].forEach(([label, value], index) => {
        const row = summary.addRow([label, value]);
        row.getCell(1).font = { bold: true, color: { argb: colors.navy } };
        if (label === 'Total Anggaran') row.getCell(2).numFmt = money;
        row.eachCell((cell) => { cell.border = border; if (index % 2 === 0) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: colors.soft } }; });
      });

      const componentSheet = workbook.addWorksheet('Komponen', { properties: { tabColor: { argb: colors.sky } } });
      title(componentSheet, 'Tabel Komponen', 'Rekap seluruh komponen yang dipasang');
      componentSheet.columns = [{ width: 6 }, { width: 32 }, { width: 22 }, { width: 12 }, { width: 10 }, { width: 18 }, { width: 18 }];
      componentSheet.addRow(['No', 'Komponen', 'Kategori', 'Satuan', 'Qty', 'Harga Satuan', 'Subtotal']);
      header(componentSheet.getRow(4), colors.sky);
      const componentRows = new Map<string, ExcelJS.Row>();
      components.forEach((component, index) => {
        const row = componentSheet.addRow([index + 1, component.name, component.category, component.unit, component.quantity, component.price, component.subtotal]);
        row.getCell(6).numFmt = money;
        row.getCell(7).numFmt = money;
        row.eachCell((cell) => { cell.border = border; });
        componentRows.set(component.componentId, row);
      });
      const totalRow = componentSheet.addRow(['', 'TOTAL', '', '', report.total_qty, '', report.grand_total]);
      totalRow.getCell(7).numFmt = money;
      totalRow.eachCell((cell) => { cell.font = { bold: true, color: { argb: colors.white } }; cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: colors.navy } }; cell.border = border; });

      const detailSheet = workbook.addWorksheet('Detail Komponen', { properties: { tabColor: { argb: colors.amber } } });
      title(detailSheet, 'Detail Komponen', 'Analisis Harga Satuan Pekerjaan (AHSP) komponen yang dipasang');
      detailSheet.columns = [{ width: 6 }, { width: 48 }, { width: 12 }, { width: 14 }, { width: 19 }, { width: 19 }];
      const anchors = new Map<string, number>();
      components.forEach((component, componentIndex) => {
        if (componentIndex) detailSheet.addRow([]);
        const anchor = detailSheet.rowCount + 1;
        anchors.set(component.componentId, anchor);
        detailSheet.mergeCells(anchor, 1, anchor, 6);
        const heading = detailSheet.getCell(anchor, 1);
        heading.value = `${componentIndex + 1}. ${component.name}`;
        heading.font = { bold: true, color: { argb: colors.white } };
        heading.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: colors.navy } };
        const headerRow = detailSheet.addRow(['No', 'Uraian', 'Satuan', 'Koefisien', 'Harga Satuan', 'Jumlah Harga']);
        header(headerRow, colors.amber);
        const componentDetails = details.filter((detail) => detail.component_id === component.componentId);
        let no = 1;
        if (!componentDetails.length) {
          detailSheet.addRow(['', 'Detail AHSP belum tersedia untuk komponen ini.', '', '', '', '']);
        } else AHSP_TYPES.forEach((type) => {
          const group = detailSheet.addRow(['', type, '', '', '', '']);
          detailSheet.mergeCells(group.number, 2, group.number, 6);
          group.getCell(2).font = { bold: true, color: { argb: colors.navy } };
          componentDetails.filter((detail) => detail.jenis === type).forEach((detail) => {
            const row = detailSheet.addRow([no++, detail.uraian, detail.satuan, Number(detail.koefisien), Number(detail.harga_satuan), Number(detail.jumlah_harga)]);
            row.getCell(4).numFmt = '0.0000'; row.getCell(5).numFmt = money; row.getCell(6).numFmt = money;
            row.eachCell((cell) => { cell.border = border; });
          });
        });
        const d = componentDetails.reduce((sum, detail) => sum + Number(detail.jumlah_harga || 0), 0);
        const e = d * biayaUmumKoef;
        [['D. Jumlah A + B + C', '', '', '', d], ['E. Biaya Umum dan Keuntungan', '', `${biayaUmumKoef * 100}%`, '', e], ['F. Harga Satuan Pekerjaan (D + E)', '', '', '', d + e]].forEach((values, index) => {
          const row = detailSheet.addRow(['', ...values]);
          row.getCell(2).font = { bold: true, color: { argb: index === 2 ? colors.green : colors.navy } };
          row.getCell(6).numFmt = money;
          row.eachCell((cell) => { cell.border = border; });
        });
      });
      components.forEach((component) => {
        const row = componentRows.get(component.componentId);
        const anchor = anchors.get(component.componentId);
        if (!row || !anchor) return;
        row.getCell(6).value = { text: formatRupiah(component.price), hyperlink: `#'Detail Komponen'!A${anchor}`, tooltip: `Buka detail AHSP ${component.name}` };
        row.getCell(6).font = { color: { argb: colors.blue }, underline: true };
      });

      const buffer = await workbook.xlsx.writeBuffer();
      const url = URL.createObjectURL(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = `RAB-${report.project_name.replace(/[^a-z0-9]+/gi, '-')}.xlsx`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (downloadError) {
      setError(downloadError instanceof Error ? downloadError.message : 'File Excel gagal dibuat.');
    } finally {
      setDownloadingId(null);
    }
  };

  const closeDeleteModal = () => {
    if (deleting) return;
    setDeleteTarget(null);
    setDeleteError(null);
  };

  const deleteReport = async () => {
    if (!deleteTarget || deleting) return;

    setDeleting(true);
    setDeleteError(null);
    const { error: removeError } = await supabase
      .from('rab_reports')
      .delete()
      .eq('id', deleteTarget.id)
      .eq('user_id', userId);

    if (removeError) {
      setDeleteError(removeError.message || 'Laporan gagal dihapus. Coba lagi.');
      setDeleting(false);
      return;
    }

    setReports((current) => current.filter((report) => report.id !== deleteTarget.id));
    setDeleteTarget(null);
    setDeleting(false);
  };

  const total = reports.reduce((sum, report) => sum + Number(report.grand_total || 0), 0);
  return (
    <main className="reports-page workspace-content-page">
      <div className="reports-heading"><div><span className="workspace-kicker">DOKUMEN PROJECT</span><h1>Laporan RAB</h1><p>Riwayat RAB yang sudah disimpan dari tahap ringkasan proyek.</p></div><button className="dashboard-outline" type="button" onClick={() => void loadReports()}>Muat Ulang</button></div>
      <section className="report-stats"><article><span><FileSpreadsheet /></span><div><small>Total Laporan</small><strong>{reports.length}</strong></div></article><article><span>Rp</span><div><small>Akumulasi Nilai</small><strong>{new Intl.NumberFormat('id-ID', { notation: 'compact', maximumFractionDigits: 1 }).format(total)}</strong></div></article><article><span>∑</span><div><small>Total Item</small><strong>{reports.reduce((sum, report) => sum + Number(report.total_items || 0), 0)}</strong></div></article></section>
      <section className="reports-panel"><header className="report-toolbar"><div className="report-search"><Search /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Cari laporan, klien, atau lokasi..." /></div></header>{error && <div className="workspace-error">{error}</div>}{loading ? <div className="workspace-loading"><Loader2 className="spin" /> Memuat laporan...</div> : filtered.length === 0 ? <div className="workspace-empty"><FileSpreadsheet /><h2>Belum ada laporan</h2><p>Simpan RAB dari tahap Ringkasan untuk menampilkannya di sini.</p></div> : <div className="report-table-wrap"><table className="report-table"><thead><tr><th>Proyek</th><th>Klien &amp; Lokasi</th><th>Isi Laporan</th><th>Nilai RAB</th><th>Dibuat</th><th>Aksi</th></tr></thead><tbody>{filtered.map((report) => <tr key={report.id}><td><div className="report-project"><span><FileSpreadsheet /></span><div><strong>{report.project_name}</strong><small>{report.project_date ? new Date(report.project_date).toLocaleDateString('id-ID') : 'Tanpa tanggal proyek'}</small></div></div></td><td><strong>{report.client || '-'}</strong><small>{report.location || '-'}</small></td><td><strong>{report.total_items} item</strong><small>{report.total_qty} total volume</small></td><td><strong>{new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(report.grand_total)}</strong></td><td><strong>{new Date(report.created_at).toLocaleDateString('id-ID')}</strong><small>{new Date(report.created_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}</small></td><td><div className="report-row-actions"><button className="report-download" type="button" disabled={downloadingId !== null} onClick={() => void downloadReport(report)}>{downloadingId === report.id ? <Loader2 className="spin" /> : <Download />}{downloadingId === report.id ? 'Membuat...' : 'Excel'}</button><button className="report-delete" type="button" aria-label={`Hapus laporan ${report.project_name}`} onClick={() => { setDeleteError(null); setDeleteTarget(report); }}><Trash2 /> Hapus</button></div></td></tr>)}</tbody></table></div>}</section>
      <Modal open={deleteTarget !== null} onClose={closeDeleteModal} title="Hapus laporan?" subtitle="Tindakan ini tidak dapat dibatalkan.">
        <p className="text-sm leading-6 text-slate-600">Laporan <span className="font-semibold text-slate-900">{deleteTarget?.project_name}</span> akan dihapus permanen.</p>
        {deleteError && <div className="mt-4 rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700" role="alert">Laporan gagal dihapus: {deleteError}</div>}
        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><button type="button" className="btn-secondary" disabled={deleting} onClick={closeDeleteModal}>Batal</button><button type="button" disabled={deleting} onClick={() => void deleteReport()} className="inline-flex items-center justify-center gap-2 rounded-xl bg-rose-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-rose-700 disabled:opacity-60">{deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}{deleting ? 'Menghapus...' : 'Hapus permanen'}</button></div>
      </Modal>
    </main>
  );
}
