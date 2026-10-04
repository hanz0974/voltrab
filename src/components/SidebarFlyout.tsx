import { useEffect, useState, type ReactNode } from 'react';
import {
  ArrowRight,
  Cable,
  Download,
  FileSpreadsheet,
  FolderOpen,
  Lightbulb,
  Loader2,
  Package,
  Plus,
  ShieldCheck,
  ToggleLeft,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import type { PartCategory } from '../types';
import type { RabReport, SavedProject } from '../lib/useProjectStorage';
import { supabase } from '../lib/supabase';
import { isHiddenSettingComponentId } from '../lib/biayaUmumSetting';
import { downloadRabReportExcel } from '../lib/reportExcel';
import { CATEGORIES } from './ComponentsManager';

const RECENT_LIMIT = 6;

const relativeTimeFormat = new Intl.RelativeTimeFormat('id', { numeric: 'auto' });

/** Waktu relatif dalam bahasa Indonesia, misalnya "2 jam yang lalu" atau "kemarin". */
const relativeTime = (iso: string) => {
  const seconds = Math.round((new Date(iso).getTime() - Date.now()) / 1000);
  if (!Number.isFinite(seconds)) return '';
  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ['year', 31536000],
    ['month', 2592000],
    ['day', 86400],
    ['hour', 3600],
    ['minute', 60],
  ];
  for (const [unit, size] of units) {
    if (Math.abs(seconds) >= size) return relativeTimeFormat.format(Math.round(seconds / size), unit);
  }
  return 'baru saja';
};

const formatRupiah = (value: number) =>
  new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(value);

interface FlyoutHoverProps {
  open: boolean;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
}

/** Kerangka bersama panel samping: posisi, animasi, judul, dan keterangan singkat. */
function FlyoutShell({
  open,
  onMouseEnter,
  onMouseLeave,
  title,
  meta,
  children,
}: FlyoutHoverProps & { title: string; meta?: string; children: ReactNode }) {
  return (
    <div
      className={`sidebar-flyout ${open ? 'is-open' : ''}`}
      aria-hidden={!open}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <div className="sidebar-flyout-head">
        <p className="sidebar-flyout-title">{title}</p>
        {meta && <span>{meta}</span>}
      </div>
      {children}
    </div>
  );
}

function SectionHeader({ label, open, onViewAll }: { label: string; open: boolean; onViewAll: () => void }) {
  return (
    <div className="sidebar-flyout-section">
      <span>{label}</span>
      <button type="button" tabIndex={open ? 0 : -1} onClick={onViewAll}>
        Lihat semua <ArrowRight />
      </button>
    </div>
  );
}

/* ----------------------------- Proyek Saya ----------------------------- */

interface ProjectsFlyoutProps extends FlyoutHoverProps {
  projects: SavedProject[];
  activeProjectId: string | null;
  onNew: () => void;
  onOpen: (project: SavedProject) => void;
  onViewAll: () => void;
}

/** Panel Proyek Saya: tombol proyek baru dan proyek yang terakhir diubah. */
export function ProjectsFlyout({ projects, activeProjectId, onNew, onOpen, onViewAll, ...hover }: ProjectsFlyoutProps) {
  const recent = [...projects]
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
    .slice(0, RECENT_LIMIT);
  const tabIndex = hover.open ? 0 : -1;

  return (
    <FlyoutShell {...hover} title="Proyek Saya" meta={`${projects.length} proyek`}>
      <button type="button" className="sidebar-flyout-new" tabIndex={tabIndex} onClick={onNew}>
        <Plus />
        Proyek Baru
      </button>
      <SectionHeader label="TERAKHIR DIUBAH" open={hover.open} onViewAll={onViewAll} />
      {recent.length === 0 ? (
        <p className="sidebar-flyout-empty">Belum ada proyek tersimpan.</p>
      ) : (
        <ul>
          {recent.map((saved) => {
            const client = saved.project_data?.project?.client?.trim();
            return (
              <li key={saved.id}>
                <button
                  type="button"
                  tabIndex={tabIndex}
                  className={`sidebar-flyout-item ${saved.id === activeProjectId ? 'active' : ''}`}
                  onClick={() => onOpen(saved)}
                >
                  <FolderOpen />
                  <span>
                    <b>{saved.name || saved.project_data?.project?.name || 'Proyek tanpa nama'}</b>
                    <small>
                      {client ? `${client} · ` : ''}
                      {relativeTime(saved.updated_at)}
                    </small>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </FlyoutShell>
  );
}

/* --------------------------- Daftar Komponen --------------------------- */

const CATEGORY_ICONS: Partial<Record<PartCategory, LucideIcon>> = {
  Pengaman: ShieldCheck,
  Penerangan: Lightbulb,
  'Saklar & Stop Kontak': ToggleLeft,
  Kabel: Cable,
  'Panel & MDP': Zap,
};

interface ComponentsFlyoutProps extends FlyoutHoverProps {
  onSelectCategory: (category: PartCategory | 'all') => void;
  onAddComponent: () => void;
}

/**
 * Panel Daftar Komponen: tombol tambah komponen dan jumlah komponen per kategori.
 * Data diambil dari tabel components yang sama dengan halaman katalog; pembatasan per akun diurus RLS.
 */
export function ComponentsFlyout({ onSelectCategory, onAddComponent, ...hover }: ComponentsFlyoutProps) {
  const [counts, setCounts] = useState<Partial<Record<string, number>> | null>(null);

  useEffect(() => {
    if (!hover.open) return;
    let cancelled = false;
    void (async () => {
      const { data, error } = await supabase.from('components').select('id, category');
      if (cancelled || error || !data) return;
      const next: Partial<Record<string, number>> = {};
      for (const row of data as { id: string; category: string }[]) {
        if (isHiddenSettingComponentId(row.id)) continue;
        next[row.category] = (next[row.category] ?? 0) + 1;
      }
      setCounts(next);
    })();
    return () => {
      cancelled = true;
    };
  }, [hover.open]);

  const total = counts ? Object.values(counts).reduce<number>((sum, value) => sum + (value ?? 0), 0) : null;
  const tabIndex = hover.open ? 0 : -1;

  return (
    <FlyoutShell {...hover} title="Daftar Komponen" meta={total === null ? 'Memuat...' : `${total} komponen`}>
      <button type="button" className="sidebar-flyout-new" tabIndex={tabIndex} onClick={onAddComponent}>
        <Plus />
        Tambah Komponen
      </button>
      <SectionHeader label="KATEGORI" open={hover.open} onViewAll={() => onSelectCategory('all')} />
      <ul>
        {CATEGORIES.map((category) => {
          const Icon = CATEGORY_ICONS[category] ?? Package;
          return (
            <li key={category}>
              <button
                type="button"
                tabIndex={tabIndex}
                className="sidebar-flyout-item is-compact"
                onClick={() => onSelectCategory(category)}
              >
                <Icon />
                <span>
                  <b>{category}</b>
                </span>
                <em className="sidebar-flyout-count">{counts ? counts[category] ?? 0 : '–'}</em>
              </button>
            </li>
          );
        })}
      </ul>
    </FlyoutShell>
  );
}

/* ------------------------------- Laporan ------------------------------- */

interface ReportSummary {
  id: string;
  project_name: string;
  client: string | null;
  grand_total: number;
  created_at: string;
}

interface ReportsFlyoutProps extends FlyoutHoverProps {
  userId: string;
  onOpenReport: (reportId: string) => void;
  onViewAll: () => void;
}

/** Panel Laporan: laporan RAB yang terakhir disimpan beserta nilainya dan tombol unduh Excel. */
export function ReportsFlyout({ userId, onOpenReport, onViewAll, ...hover }: ReportsFlyoutProps) {
  const [reports, setReports] = useState<ReportSummary[] | null>(null);
  const [total, setTotal] = useState<number | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  /** Ambil data laporan lengkap lalu buat Excel dengan fungsi yang sama seperti halaman Laporan. */
  const handleDownload = async (reportId: string) => {
    if (downloadingId) return;
    setDownloadingId(reportId);
    setDownloadError(null);
    try {
      const { data, error } = await supabase
        .from('rab_reports')
        .select('id, project_name, client, location, project_date, report_data, grand_total, total_items, total_qty, created_at')
        .eq('id', reportId)
        .eq('user_id', userId)
        .single();
      if (error || !data) throw new Error(error?.message ?? 'Laporan tidak ditemukan.');
      await downloadRabReportExcel(data as RabReport);
    } catch (err) {
      setDownloadError(err instanceof Error ? err.message : 'File Excel gagal dibuat.');
    } finally {
      setDownloadingId(null);
    }
  };

  useEffect(() => {
    if (!hover.open) return;
    let cancelled = false;
    void (async () => {
      const { data, error, count } = await supabase
        .from('rab_reports')
        .select('id, project_name, client, grand_total, created_at', { count: 'exact' })
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(RECENT_LIMIT);
      if (cancelled || error || !data) return;
      setReports(data as ReportSummary[]);
      setTotal(count ?? data.length);
    })();
    return () => {
      cancelled = true;
    };
  }, [hover.open, userId]);

  const tabIndex = hover.open ? 0 : -1;

  return (
    <FlyoutShell {...hover} title="Laporan" meta={total === null ? 'Memuat...' : `${total} laporan`}>
      <SectionHeader label="TERAKHIR DISIMPAN" open={hover.open} onViewAll={onViewAll} />
      {downloadError && <p className="sidebar-flyout-error">{downloadError}</p>}
      {reports === null ? (
        <p className="sidebar-flyout-empty">Memuat laporan...</p>
      ) : reports.length === 0 ? (
        <p className="sidebar-flyout-empty">Belum ada laporan. Simpan RAB dari tahap Ringkasan.</p>
      ) : (
        <ul>
          {reports.map((report) => (
            <li key={report.id} className="sidebar-flyout-row">
              <button
                type="button"
                tabIndex={tabIndex}
                className="sidebar-flyout-item"
                onClick={() => onOpenReport(report.id)}
              >
                <FileSpreadsheet />
                <span>
                  <b>{report.project_name}</b>
                  <small>
                    {formatRupiah(report.grand_total)} · {relativeTime(report.created_at)}
                  </small>
                </span>
              </button>
              <button
                type="button"
                tabIndex={tabIndex}
                className="sidebar-flyout-action"
                title="Unduh Excel"
                aria-label={`Unduh Excel laporan ${report.project_name}`}
                disabled={downloadingId !== null}
                onClick={() => void handleDownload(report.id)}
              >
                {downloadingId === report.id ? <Loader2 className="spin" /> : <Download />}
              </button>
            </li>
          ))}
        </ul>
      )}
    </FlyoutShell>
  );
}
