import { Download, FileSpreadsheet, Loader2, Search, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Modal } from './Modal';
import { supabase } from '../lib/supabase';
import { downloadRabReportExcel } from '../lib/reportExcel';
import type { RabReport } from '../lib/useProjectStorage';

interface UserReportsWorkspaceProps {
  userId: string;
  /** Laporan yang dipilih dari panel samping; nonce membuat laporan yang sama dapat dipilih ulang. */
  highlightRequest?: { id: string; nonce: number };
}

export function UserReportsWorkspace({ userId, highlightRequest }: UserReportsWorkspaceProps) {
  const [reports, setReports] = useState<RabReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<RabReport | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [flashId, setFlashId] = useState<string | null>(null);

  // Laporan yang dipilih dari panel samping: kosongkan pencarian, gulir ke barisnya, lalu sorot sebentar
  useEffect(() => {
    if (!highlightRequest || loading) return;
    setQuery('');
    const id = highlightRequest.id;
    const frame = window.requestAnimationFrame(() => {
      document.querySelector(`[data-report-id="${CSS.escape(id)}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setFlashId(id);
    });
    const timer = window.setTimeout(() => setFlashId(null), 2400);
    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(timer);
    };
  }, [highlightRequest, loading]);

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
      // Pembuatan berkas Excel dipakai bersama dengan panel samping Laporan
      await downloadRabReportExcel(report);
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
      <section className="reports-panel"><header className="report-toolbar"><div className="report-search"><Search /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Cari laporan, klien, atau lokasi..." /></div></header>{error && <div className="workspace-error">{error}</div>}{loading ? <div className="workspace-loading"><Loader2 className="spin" /> Memuat laporan...</div> : filtered.length === 0 ? <div className="workspace-empty"><FileSpreadsheet /><h2>Belum ada laporan</h2><p>Simpan RAB dari tahap Ringkasan untuk menampilkannya di sini.</p></div> : <div className="report-table-wrap"><table className="report-table"><thead><tr><th>Proyek</th><th>Klien &amp; Lokasi</th><th>Isi Laporan</th><th>Nilai RAB</th><th>Dibuat</th><th>Aksi</th></tr></thead><tbody>{filtered.map((report) => <tr key={report.id} data-report-id={report.id} className={flashId === report.id ? 'report-row-flash' : undefined}><td><div className="report-project"><span><FileSpreadsheet /></span><div><strong>{report.project_name}</strong><small>{report.project_date ? new Date(report.project_date).toLocaleDateString('id-ID') : 'Tanpa tanggal proyek'}</small></div></div></td><td><strong>{report.client || '-'}</strong><small>{report.location || '-'}</small></td><td><strong>{report.total_items} item</strong><small>{report.total_qty} total volume</small></td><td><strong>{new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(report.grand_total)}</strong></td><td><strong>{new Date(report.created_at).toLocaleDateString('id-ID')}</strong><small>{new Date(report.created_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}</small></td><td><div className="report-row-actions"><button className="report-download" type="button" disabled={downloadingId !== null} onClick={() => void downloadReport(report)}>{downloadingId === report.id ? <Loader2 className="spin" /> : <Download />}{downloadingId === report.id ? 'Membuat...' : 'Excel'}</button><button className="report-delete" type="button" aria-label={`Hapus laporan ${report.project_name}`} onClick={() => { setDeleteError(null); setDeleteTarget(report); }}><Trash2 /> Hapus</button></div></td></tr>)}</tbody></table></div>}</section>
      <Modal open={deleteTarget !== null} onClose={closeDeleteModal} title="Hapus laporan?" subtitle="Tindakan ini tidak dapat dibatalkan.">
        <p className="text-sm leading-6 text-slate-600">Laporan <span className="font-semibold text-slate-900">{deleteTarget?.project_name}</span> akan dihapus permanen.</p>
        {deleteError && <div className="mt-4 rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700" role="alert">Laporan gagal dihapus: {deleteError}</div>}
        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><button type="button" className="btn-secondary" disabled={deleting} onClick={closeDeleteModal}>Batal</button><button type="button" disabled={deleting} onClick={() => void deleteReport()} className="inline-flex items-center justify-center gap-2 rounded-xl bg-rose-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-rose-700 disabled:opacity-60">{deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}{deleting ? 'Menghapus...' : 'Hapus permanen'}</button></div>
      </Modal>
    </main>
  );
}
