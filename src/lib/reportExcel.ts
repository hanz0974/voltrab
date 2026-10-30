import * as ExcelJS from 'exceljs';
import { supabase } from './supabase';
import { formatRupiah } from '../data';
import { getBiayaUmumKoef } from './biayaUmumSetting';
import type { Floor } from '../types';
import type { RabReport } from './useProjectStorage';

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

/**
 * Membuat dan mengunduh berkas Excel RAB (lembar Ringkasan, Komponen, dan Detail Komponen)
 * dari satu laporan tersimpan. Dipakai bersama oleh halaman Laporan dan panel samping Laporan.
 */
export async function downloadRabReportExcel(report: RabReport): Promise<void> {
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
      ? supabase.from('component_detail_view').select('component_id, jenis, uraian, satuan, koefisien, harga_satuan, jumlah_harga').in('component_id', componentIds).order('created_at', { ascending: true })
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
}
