import { ArrowRight, FolderOpen, Loader2, MapPin, Plus, Search, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { SavedProject } from '../lib/useProjectStorage';

interface ProjectsWorkspaceProps {
  projects: SavedProject[];
  loading: boolean;
  onNew: () => void;
  onOpen: (project: SavedProject) => void;
  onDelete: (event: React.MouseEvent, project: SavedProject) => void;
}

function projectTotal(project: SavedProject) {
  return (project.project_data?.floors ?? []).flatMap((floor) => floor.rooms ?? []).flatMap((room) => room.parts ?? []).reduce((sum, part) => sum + Number(part.price || 0) * Number(part.quantity || 0), 0);
}

export function ProjectsWorkspace({ projects, loading, onNew, onOpen, onDelete }: ProjectsWorkspaceProps) {
  const [query, setQuery] = useState('');
  const filtered = useMemo(() => projects.filter((project) => `${project.name} ${project.project_data.project.client} ${project.project_data.project.location}`.toLowerCase().includes(query.toLowerCase())), [projects, query]);
  const totalValue = projects.reduce((sum, project) => sum + projectTotal(project), 0);

  return (
    <main className="projects-page workspace-content-page">
      <div className="projects-heading"><div><span className="workspace-kicker">WORKSPACE PROJECT</span><h1>Proyek Saya</h1><p>Kelola seluruh proyek RAB kelistrikan yang tersimpan di akun Anda.</p></div><button className="button-primary projects-new-button" type="button" onClick={onNew}><Plus aria-hidden="true" /> <span>Buat Proyek Baru</span></button></div>
      <section className="projects-overview"><article><span className="overview-icon all"><FolderOpen /></span><div><small>Total Proyek</small><strong>{projects.length}</strong><p>Seluruh proyek</p></div></article><article><span className="overview-icon working">◷</span><div><small>Dalam Proses</small><strong>{projects.filter((project) => project.project_data.step !== 'summary').length}</strong><p>Perlu dilanjutkan</p></div></article><article><span className="overview-icon finished">✓</span><div><small>Ringkasan</small><strong>{projects.filter((project) => project.project_data.step === 'summary').length}</strong><p>Sudah ditinjau</p></div></article><article><span className="overview-icon value">Rp</span><div><small>Total Nilai RAB</small><strong>{new Intl.NumberFormat('id-ID', { notation: 'compact', maximumFractionDigits: 1 }).format(totalValue)}</strong><p>Dari semua proyek</p></div></article></section>
      <section className="projects-panel">
        <header className="projects-tools"><div className="project-search"><Search /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Cari nama proyek, klien, atau lokasi..." /></div><span className="project-result-count">{filtered.length} proyek ditemukan</span></header>
        {loading ? <div className="workspace-loading"><Loader2 className="spin" /> Memuat proyek...</div> : filtered.length === 0 ? <div className="workspace-empty"><FolderOpen /><h2>{projects.length ? 'Proyek tidak ditemukan' : 'Belum ada proyek'}</h2><p>{projects.length ? 'Coba gunakan kata pencarian lain.' : 'Mulai proyek pertama dan data akan tersimpan otomatis.'}</p>{projects.length === 0 && <button className="button-primary" type="button" onClick={onNew}>Buat Proyek</button>}</div> : <div className="projects-table-wrap"><table className="projects-table"><thead><tr><th>Nama Proyek</th><th>Klien &amp; Lokasi</th><th>Tahap</th><th>Nilai RAB</th><th>Terakhir Diperbarui</th><th>Aksi</th></tr></thead><tbody>{filtered.map((project) => { const data = project.project_data; const parts = (data.floors ?? []).flatMap((floor) => floor.rooms ?? []).flatMap((room) => room.parts ?? []); return <tr className="project-entry" key={project.id}><td><button className="project-main open-project" type="button" onClick={() => onOpen(project)}><span className="project-monogram blue">{project.name.slice(0, 2).toUpperCase()}</span><div><strong>{project.name}</strong><small>{data.floors?.length ?? 0} lantai · {parts.length} item</small></div></button></td><td><strong>{data.project.client || 'Belum diisi'}</strong><small><MapPin /> {data.project.location || 'Lokasi belum diisi'}</small></td><td><span className={`list-status ${data.step === 'summary' ? 'done' : 'progress'}`}>{data.step === 'summary' ? 'Ringkasan' : data.step === 'components' ? 'Susunan Pekerjaan' : 'Informasi Proyek'}</span></td><td><strong>{new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(projectTotal(project))}</strong><small>{parts.length} komponen</small></td><td><strong>{new Date(project.updated_at).toLocaleDateString('id-ID')}</strong><small>{new Date(project.updated_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}</small></td><td><div className="project-row-actions"><button className="project-continue-action" type="button" onClick={() => onOpen(project)}>Lanjutkan <ArrowRight /></button><button className="project-delete-action" type="button" onClick={(event) => onDelete(event, project)} aria-label={`Hapus ${project.name}`}><Trash2 /></button></div></td></tr>; })}</tbody></table></div>}
      </section>
    </main>
  );
}
