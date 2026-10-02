import { AlertTriangle, ArrowRight, Boxes, CheckCircle2, FolderOpen, TrendingUp, WalletCards } from 'lucide-react';
import type { SavedProject } from '../lib/useProjectStorage';

interface WorkspaceDashboardProps {
  projects: SavedProject[];
  userName: string;
  onNewProject: () => void;
  onOpenProjects: () => void;
  onOpenProject: (project: SavedProject) => void;
  onOpenComponents: () => void;
}

function projectTotal(project: SavedProject) {
  return (project.project_data?.floors ?? []).flatMap((floor) => floor.rooms ?? []).flatMap((room) => room.parts ?? []).reduce((total, part) => total + Number(part.price || 0) * Number(part.quantity || 0), 0);
}

function formatCompactRupiah(value: number) {
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', notation: 'compact', maximumFractionDigits: 1 }).format(value);
}

export function WorkspaceDashboard({ projects, userName, onNewProject, onOpenProjects, onOpenProject, onOpenComponents }: WorkspaceDashboardProps) {
  const totalValue = projects.reduce((sum, project) => sum + projectTotal(project), 0);
  const latest = projects[0];
  const completeProjects = projects.filter((project) => project.project_data?.completed?.includes('summary')).length;
  const totalItems = projects.reduce((sum, project) => sum + (project.project_data?.floors ?? []).flatMap((floor) => floor.rooms ?? []).flatMap((room) => room.parts ?? []).length, 0);

  return (
    <main className="dashboard workspace-content-page">
      <section className="dashboard-welcome">
        <div><p className="date">WORKSPACE RAB KELISTRIKAN</p><h1>Selamat datang kembali, {userName}</h1><span>Ringkasan ini dihitung dari proyek yang tersimpan di akun Anda.</span></div>
        <div><button className="dashboard-outline" type="button" onClick={onOpenProjects}>Lihat Proyek Saya</button><button className="button-primary" type="button" onClick={onNewProject}>＋ Proyek Baru</button></div>
      </section>

      <section className="dashboard-metrics">
        <article><div className="metric-head"><span className="metric-icon cyan"><WalletCards /></span><small>TOTAL NILAI RAB</small></div><strong>{formatCompactRupiah(totalValue)}</strong><p><b><TrendingUp /> Data langsung</b> dari seluruh proyek</p></article>
        <article><div className="metric-head"><span className="metric-icon purple"><FolderOpen /></span><small>PROYEK TERSIMPAN</small></div><strong>{projects.length} proyek</strong><p><b className="neutral">{completeProjects} selesai</b> · {Math.max(projects.length - completeProjects, 0)} dikerjakan</p></article>
        <article><div className="metric-head"><span className="metric-icon amber"><Boxes /></span><small>ITEM PEKERJAAN</small></div><strong>{totalItems} item</strong><p><b className="neutral">Tersebar</b> di seluruh ruangan</p></article>
        <article><div className="metric-head"><span className="metric-icon green"><CheckCircle2 /></span><small>PROYEK LENGKAP</small></div><strong>{projects.length ? Math.round((completeProjects / projects.length) * 100) : 0}%</strong><p><b>Ringkasan RAB</b> sudah ditinjau</p></article>
      </section>

      <section className="dashboard-layout dashboard-live-layout">
        <article className="analytics-card monthly-chart dashboard-project-chart">
          <header><div><h2>Nilai Proyek Terbaru</h2><p>Perbandingan nilai maksimal enam proyek terakhir.</p></div></header>
          {projects.length === 0 ? <div className="dashboard-empty"><FolderOpen /><h3>Belum ada proyek</h3><p>Buat proyek pertama untuk melihat analisis biaya di dashboard.</p><button className="button-primary" type="button" onClick={onNewProject}>Buat Proyek</button></div> : (
            <div className="live-project-bars">{projects.slice(0, 6).reverse().map((project) => { const total = projectTotal(project); const max = Math.max(...projects.slice(0, 6).map(projectTotal), 1); return <button key={project.id} type="button" onClick={() => onOpenProject(project)} title={`${project.name}: ${formatCompactRupiah(total)}`}><span>{formatCompactRupiah(total)}</span><i style={{ height: `${Math.max(12, (total / max) * 100)}%` }} /><small>{project.name}</small></button>; })}</div>
          )}
        </article>

        <article className="analytics-card continue-card dashboard-continue-card">
          <div className="continue-label">LANJUTKAN PEKERJAAN</div>
          {latest ? <><div className="continue-title"><span>{latest.name.slice(0, 2).toUpperCase()}</span><div><h2>{latest.name}</h2><p>Diperbarui {new Date(latest.updated_at).toLocaleString('id-ID')}</p></div></div><div className="continue-progress"><div><span>Tahap aktif</span><b>{latest.project_data.step === 'summary' ? 'Ringkasan RAB' : latest.project_data.step === 'components' ? 'Susunan Pekerjaan' : 'Informasi Proyek'}</b></div><small>{latest.project_data.project.client || 'Klien belum diisi'} · {latest.project_data.project.location || 'Lokasi belum diisi'}</small></div><button type="button" onClick={() => onOpenProject(latest)}>Lanjutkan Perhitungan <ArrowRight /></button></> : <div className="dashboard-empty compact"><AlertTriangle /><p>Belum ada pekerjaan yang dapat dilanjutkan.</p><button className="button-primary" type="button" onClick={onNewProject}>Mulai Sekarang</button></div>}
        </article>

        <article className="analytics-card activity-card dashboard-recent-list"><header><div><h2>Proyek Terbaru</h2><p>Perubahan terakhir pada workspace Anda.</p></div><button type="button" onClick={onOpenProjects}>Lihat semua</button></header><ul>{projects.slice(0, 4).map((project) => <li key={project.id}><span className="activity-icon edit"><FolderOpen /></span><div><button type="button" onClick={() => onOpenProject(project)}>{project.name}</button><p>{project.project_data.project.client || 'Klien belum diisi'} · {formatCompactRupiah(projectTotal(project))}</p><small>{new Date(project.updated_at).toLocaleString('id-ID')}</small></div></li>)}{projects.length === 0 && <li className="empty-list">Belum ada aktivitas proyek.</li>}</ul></article>

        <article className="analytics-card reference-health"><header><div><h2>Katalog Komponen</h2><p>Harga referensi dan analisis pekerjaan dikelola dari satu tempat.</p></div><span className="health-badge">Terhubung</span></header><div className="catalog-callout"><Boxes /><div><strong>Daftar komponen v1 sudah aktif</strong><p>Kelola AHSP, detail tenaga kerja, bahan, peralatan, dan biaya umum.</p></div></div><div className="health-footer"><span><i /> Tersambung ke katalog akun</span><button type="button" onClick={onOpenComponents}>Buka Daftar Komponen <ArrowRight /></button></div></article>
      </section>
    </main>
  );
}
