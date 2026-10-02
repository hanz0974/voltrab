import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle, BarChart3, Boxes, CheckCircle, ChevronLeft, FileSpreadsheet,
  FolderOpen, LayoutDashboard, Loader2, LogOut, Menu, PanelLeftClose,
  Trash2, UserRound, X, Zap,
} from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import type { Floor, ProjectState, StepId } from './types';
import { uid } from './data';
import { Stepper } from './components/Stepper';
import { ProjectStep } from './components/ProjectStep';
import { ComponentsStep } from './components/ComponentsStep';
import { SummaryStep } from './components/SummaryStep';
import { AuthScreen } from './components/AuthScreen';
import { AdminDashboard } from './components/AdminDashboard';
import { ComponentsManager } from './components/ComponentsManager';
import { LandingPage } from './components/LandingPage';
import { Modal } from './components/Modal';
import { ProjectsWorkspace } from './components/ProjectsWorkspace';
import { UserReportsWorkspace } from './components/UserReportsWorkspace';
import { WorkspaceDashboard } from './components/WorkspaceDashboard';
import { useAuth } from './lib/auth';
import { useProjectStorage, type ProjectData, type SavedProject } from './lib/useProjectStorage';

type WorkspaceView = 'dashboard' | 'projects' | 'editor' | 'components' | 'reports';
const STEP_ORDER: StepId[] = ['project', 'components', 'summary'];

function createInitialProject(): ProjectState {
  return { name: '', client: '', location: '', date: new Date().toISOString().slice(0, 10), floors: [] };
}

function createFloor(index: number): Floor {
  return { id: uid(), name: `Lantai ${index + 1}`, rooms: [] };
}

const VIEW_LABELS: Record<WorkspaceView, string> = {
  dashboard: 'Dashboard', projects: 'Proyek Saya', editor: 'Perhitungan RAB',
  components: 'Daftar Komponen', reports: 'Laporan',
};

export default function App() {
  const { user, loading: authLoading, signOut, isAdmin } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const storage = useProjectStorage(user?.id);
  const { currentProjectId, debouncedSave } = storage;
  const [authRequested, setAuthRequested] = useState(false);
  const [view, setView] = useState<WorkspaceView>('dashboard');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [step, setStep] = useState<StepId>('project');
  const [completed, setCompleted] = useState<Set<StepId>>(new Set());
  const [project, setProject] = useState<ProjectState>(createInitialProject);
  const [floors, setFloors] = useState<Floor[]>([createFloor(0)]);
  const [restoring, setRestoring] = useState(false);
  const [pendingDeleteProject, setPendingDeleteProject] = useState<SavedProject | null>(null);
  const [deletingProject, setDeletingProject] = useState(false);
  const [deleteProjectError, setDeleteProjectError] = useState<string | null>(null);
  const restoredProjectIdRef = useRef<string | null>(null);
  const isAdminRoute = location.pathname === '/admin';
  const isWorkspaceRoute = location.pathname === '/workspace';

  const userName = useMemo(() => {
    const metadataName = user?.user_metadata?.full_name || user?.user_metadata?.name;
    if (typeof metadataName === 'string' && metadataName.trim()) return metadataName.split(' ')[0];
    return user?.email?.split('@')[0] || 'Estimator';
  }, [user]);
  const initials = useMemo(() => userName.slice(0, 2).toUpperCase(), [userName]);

  const restoreProject = useCallback((saved: SavedProject) => {
    restoredProjectIdRef.current = saved.id;
    setRestoring(true);
    const data = saved.project_data;
    setProject(data.project ?? createInitialProject());
    setFloors(data.floors ?? [createFloor(0)]);
    setStep(data.step ?? 'project');
    setCompleted(new Set(data.completed ?? []));
    setRestoring(false);
  }, []);

  useEffect(() => {
    if (
      storage.savedProjects.length > 0 &&
      storage.currentProjectId &&
      restoredProjectIdRef.current !== storage.currentProjectId &&
      !restoring
    ) {
      const found = storage.savedProjects.find((item) => item.id === storage.currentProjectId);
      if (found?.project_data?.project) restoreProject(found);
    }
  }, [storage.savedProjects, storage.currentProjectId, restoring, restoreProject]);

  useEffect(() => {
    if (authLoading) return;
    setProject(createInitialProject());
    setFloors([createFloor(0)]);
    setCompleted(new Set());
    setStep('project');
    setView('dashboard');
    setProfileOpen(false);
    restoredProjectIdRef.current = null;
  }, [user?.id, authLoading]);

  useEffect(() => {
    if (authLoading) return;

    if (user && location.pathname === '/') {
      navigate('/workspace', { replace: true });
      return;
    }

    if (location.pathname !== '/' && !isWorkspaceRoute && !isAdminRoute) {
      navigate(user ? '/workspace' : '/', { replace: true });
    }
  }, [authLoading, user, location.pathname, isWorkspaceRoute, isAdminRoute, navigate]);

  useEffect(() => {
    if (!authLoading && user && isAdminRoute && !isAdmin) navigate('/workspace', { replace: true });
  }, [authLoading, user, isAdmin, isAdminRoute, navigate]);

  useEffect(() => {
    if (!user || restoring) return;
    if (!currentProjectId && !project.name.trim()) return;
    debouncedSave({ project, floors, step, completed: Array.from(completed) }, currentProjectId);
  }, [project, floors, step, completed, user, currentProjectId, restoring, debouncedSave]);

  const restart = useCallback(() => {
    setProject(createInitialProject());
    setFloors([createFloor(0)]);
    setCompleted(new Set());
    setStep('project');
  }, []);

  const startNewProject = useCallback(async () => {
    await storage.flushPendingSave();
    const initialProject = createInitialProject();
    const initialFloors = [createFloor(0)];
    setProject(initialProject);
    setFloors(initialFloors);
    setCompleted(new Set());
    setStep('project');
    const id = await storage.saveProject({ project: initialProject, floors: initialFloors, step: 'project', completed: [] }, null);
    if (id) {
      restoredProjectIdRef.current = id;
      storage.selectProject(id);
      await storage.loadProjects();
    }
    setView('editor');
    setSidebarOpen(false);
  }, [storage]);

  const openProject = useCallback(async (saved: SavedProject) => {
    await storage.flushPendingSave();
    storage.selectProject(saved.id);
    const latest = await storage.fetchAndRestoreProject(saved.id);
    restoreProject(latest ?? saved);
    setView('editor');
    setSidebarOpen(false);
  }, [storage, restoreProject]);

  const requestDeleteProject = (event: React.MouseEvent, saved: SavedProject) => {
    event.stopPropagation();
    setDeleteProjectError(null);
    setPendingDeleteProject(saved);
  };

  const handleDeleteProject = async () => {
    if (!pendingDeleteProject || deletingProject) return;
    setDeletingProject(true);
    setDeleteProjectError(null);
    await storage.flushPendingSave();
    const deleted = await storage.deleteProject(pendingDeleteProject.id);
    if (!deleted) {
      setDeleteProjectError('Proyek gagal dihapus. Periksa koneksi lalu coba lagi.');
      setDeletingProject(false);
      return;
    }
    if (storage.currentProjectId === pendingDeleteProject.id) restart();
    setDeletingProject(false);
    setPendingDeleteProject(null);
  };

  const advance = () => {
    const index = STEP_ORDER.indexOf(step);
    setCompleted((current) => new Set(current).add(step));
    if (index < STEP_ORDER.length - 1) setStep(STEP_ORDER[index + 1]);
  };

  const goBack = () => {
    const index = STEP_ORDER.indexOf(step);
    if (index > 0) setStep(STEP_ORDER[index - 1]);
  };

  const handleSaveProject = useCallback(async () => {
    await storage.flushPendingSave();
    const projectData: ProjectData = { project, floors, step, completed: Array.from(completed) };
    const savedProjectId = await storage.saveProject(projectData, storage.currentProjectId);
    if (!savedProjectId) return { success: false, error: 'Proyek gagal disimpan. Periksa koneksi lalu coba lagi.' };
    restoredProjectIdRef.current = savedProjectId;
    storage.selectProject(savedProjectId);
    await storage.loadProjects();
    return { success: true, error: null };
  }, [completed, floors, project, step, storage]);

  const handleSaveRab = useCallback(async () => {
    const projectSaveResult = await handleSaveProject();
    if (!projectSaveResult.success) return projectSaveResult;
    const allParts = floors.flatMap((floor) => floor.rooms.flatMap((room) => room.parts));
    return storage.saveRabReport({
      project, floors,
      grandTotal: allParts.reduce((sum, part) => sum + part.price * part.quantity, 0),
      totalItems: allParts.length,
      totalQty: allParts.reduce((sum, part) => sum + part.quantity, 0),
    });
  }, [floors, handleSaveProject, project, storage]);

  const switchView = async (nextView: WorkspaceView) => {
    if (view === 'editor' && nextView !== 'editor') {
      await storage.flushPendingSave();
    }
    if (nextView === 'projects' || nextView === 'dashboard') {
      await storage.loadProjects();
    }
    setView(nextView);
    setSidebarOpen(false);
    setProfileOpen(false);
    window.scrollTo(0, 0);
  };

  const handleSignOut = async () => {
    await signOut();
    setAuthRequested(false);
    navigate('/', { replace: true });
  };

  if (authLoading) {
    return <div className="app-loading-screen"><span className="brand-mark big"><Zap /></span><Loader2 className="spin" /><p>Menyiapkan workspace...</p></div>;
  }

  if (!user) {
    if (!authRequested && !isWorkspaceRoute) return <LandingPage onStart={() => setAuthRequested(true)} onLogin={() => setAuthRequested(true)} />;
    return <div className="auth-shell-v2"><button className="auth-back" type="button" onClick={() => { setAuthRequested(false); navigate('/'); }}><ChevronLeft /> Kembali ke landing page</button><AuthScreen onAuthenticated={() => navigate('/workspace', { replace: true })} /></div>;
  }

  if (isAdminRoute) {
    if (!isAdmin) return <div className="app-loading-screen"><Loader2 className="spin" /></div>;
    return <AdminDashboard user={user} isAdmin={isAdmin} onSignOut={() => void handleSignOut()} onBackToApp={() => navigate('/workspace')} />;
  }

  return (
    <div id="app" className={`view app-view active ${sidebarCollapsed ? 'sidebar-is-collapsed' : ''}`}>
      {sidebarOpen && <button className="mobile-sidebar-backdrop" type="button" aria-label="Tutup sidebar" onClick={() => setSidebarOpen(false)} />}
      <aside className={`sidebar ${sidebarOpen ? 'mobile-open' : ''} ${sidebarCollapsed ? 'collapsed' : ''}`}>
        <div className="sidebar-brand-row">
          <button className="brand inverse" type="button" onClick={() => switchView('dashboard')}><span className="brand-mark"><Zap /></span><span className="sidebar-brand-copy">VoltRAB</span></button>
          <button className="mobile-sidebar-close" type="button" onClick={() => setSidebarOpen(false)} aria-label="Tutup sidebar"><X /></button>
        </div>
        <div className="workspace-label">WORKSPACE</div>
        <nav>
          <button className={`side-link ${view === 'dashboard' ? 'active' : ''}`} type="button" onClick={() => switchView('dashboard')}><span><LayoutDashboard /></span><em>Dashboard</em></button>
          <button className={`side-link ${view === 'projects' || view === 'editor' ? 'active' : ''}`} type="button" onClick={() => switchView('projects')}><span><FolderOpen /></span><em>Proyek Saya</em><b>{storage.savedProjects.length}</b></button>
          <button className={`side-link ${view === 'components' ? 'active' : ''}`} type="button" onClick={() => switchView('components')}><span><Boxes /></span><em>Daftar Komponen</em></button>
          <div className="workspace-label">LAINNYA</div>
          <button className={`side-link ${view === 'reports' ? 'active' : ''}`} type="button" onClick={() => switchView('reports')}><span><FileSpreadsheet /></span><em>Laporan</em></button>
        </nav>
        <button className="collapse" type="button" onClick={() => setSidebarCollapsed((current) => !current)}><PanelLeftClose /><span>{sidebarCollapsed ? 'Buka sidebar' : 'Tutup sidebar'}</span></button>
      </aside>

      <div className="app-main">
        <header className="app-nav">
          <div><button className="mobile-side" type="button" onClick={() => setSidebarOpen(true)}><Menu /></button><div className="breadcrumbs">Workspace <span>/</span> {VIEW_LABELS[view]}{view === 'editor' && project.name && <><span>/</span> {project.name}</>}</div></div>
          <div className="app-nav-actions">
            <div className={`save-indicator ${storage.saveStatus}`} role="status" aria-live="polite">
              {storage.saveStatus === 'saving' && <Loader2 className="spin" />}
              {storage.saveStatus === 'saved' && <CheckCircle />}
              {storage.saveStatus === 'error' && <AlertTriangle />}
              <span>{storage.saveStatus === 'saving' ? 'Menyimpan...' : storage.saveStatus === 'saved' ? 'Tersimpan' : storage.saveStatus === 'error' ? 'Gagal menyimpan' : ''}</span>
            </div>
            <div className="profile-wrap">
              <button className="profile" type="button" onClick={() => setProfileOpen((current) => !current)}><span>{initials}</span><div><b>{userName}</b><small>{isAdmin ? 'Administrator' : 'Estimator'}</small></div><span>⌄</span></button>
              {profileOpen && <div className="profile-menu"><div><UserRound /><span><b>{userName}</b><small>{user.email}</small></span></div>{isAdmin && <button type="button" onClick={() => navigate('/admin')}><BarChart3 /> Panel Admin</button>}<button type="button" onClick={() => void handleSignOut()}><LogOut /> Keluar</button></div>}
            </div>
          </div>
        </header>

        {view === 'dashboard' && <WorkspaceDashboard projects={storage.savedProjects} userName={userName} onNewProject={() => void startNewProject()} onOpenProjects={() => switchView('projects')} onOpenProject={(saved) => void openProject(saved)} onOpenComponents={() => switchView('components')} />}
        {view === 'projects' && <ProjectsWorkspace projects={storage.savedProjects} loading={storage.loadingProjects} onNew={() => void startNewProject()} onOpen={(saved) => void openProject(saved)} onDelete={requestDeleteProject} />}
        {view === 'editor' && (
          <main className="project-editor-page workspace-content-page">
            <div className="editor-heading"><div><span className="workspace-kicker">PERHITUNGAN RAB</span><h1>{project.name || 'Proyek Baru'}</h1><p>Lengkapi tiga tahap berikut. Perubahan tersimpan otomatis ke akun Anda.</p></div><button className="dashboard-outline" type="button" onClick={() => switchView('projects')}><FolderOpen /> Semua Proyek</button></div>
            <section className="editor-stepper"><Stepper current={step} completed={completed} onStepClick={setStep} /></section>
            <section className="editor-surface">
              {step === 'project' && <ProjectStep project={project} onChange={(patch) => setProject((current) => ({ ...current, ...patch }))} onNext={advance} />}
              {step === 'components' && <ComponentsStep projectName={project.name} floors={floors} onChange={setFloors} onNext={advance} onBack={goBack} />}
              {step === 'summary' && <SummaryStep project={project} floors={floors} onBack={goBack} onEditProject={() => setStep('project')} onEditComponents={() => setStep('components')} onRestart={() => void startNewProject()} onSaveProject={handleSaveProject} onSaveRab={handleSaveRab} />}
            </section>
          </main>
        )}
        {view === 'components' && <main className="components-workspace workspace-content-page"><div className="workspace-page-heading"><span className="workspace-kicker">KATALOG REFERENSI</span><h1>Daftar Komponen</h1><p>Kelola komponen pekerjaan dan detail analisis harga satuan yang digunakan dalam proyek.</p></div><section className="manager-surface"><ComponentsManager /></section></main>}
        {view === 'reports' && <UserReportsWorkspace userId={user.id} />}
      </div>

      <Modal open={pendingDeleteProject !== null} onClose={() => { if (!deletingProject) { setPendingDeleteProject(null); setDeleteProjectError(null); } }} title="Hapus proyek?" subtitle="Tindakan ini tidak dapat dibatalkan.">
        <p className="text-sm leading-6 text-slate-600">Proyek <span className="font-semibold text-slate-900">{pendingDeleteProject?.name}</span> beserta seluruh susunan pekerjaannya akan dihapus permanen.</p>
        {deleteProjectError && <div className="mt-4 rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700" role="alert">{deleteProjectError}</div>}
        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><button type="button" className="btn-secondary" disabled={deletingProject} onClick={() => setPendingDeleteProject(null)}>Batal</button><button type="button" disabled={deletingProject} onClick={() => void handleDeleteProject()} className="inline-flex items-center justify-center gap-2 rounded-xl bg-rose-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-rose-700 disabled:opacity-60">{deletingProject ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}{deletingProject ? 'Menghapus...' : 'Hapus permanen'}</button></div>
      </Modal>
    </div>
  );
}
