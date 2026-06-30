import { useState, useEffect, useCallback } from 'react';
import { Zap, ShieldCheck, LogOut, FolderOpen, ChevronDown, Plus, Trash2, Loader2 } from 'lucide-react';
import type { ProjectState, Floor, StepId, PartItem } from './types';
import { uid } from './data';
import { Stepper } from './components/Stepper';
import { ProjectStep } from './components/ProjectStep';
import { FloorsStep } from './components/FloorsStep';
import { PartsStep } from './components/PartsStep';
import { SummaryStep } from './components/SummaryStep';
import { DetectionModal } from './components/DetectionModal';
import { AuthScreen } from './components/AuthScreen';
import { useAuth } from './lib/auth';
import { useProjectStorage, type ProjectData, type SavedProject } from './lib/useProjectStorage';

const STEP_ORDER: StepId[] = ['project', 'floors', 'parts', 'summary'];

function createInitialProject(): ProjectState {
  return {
    name: '',
    client: '',
    location: '',
    date: new Date().toISOString().slice(0, 10),
    floors: [],
  };
}

function createFloor(idx: number): Floor {
  return {
    id: uid(),
    name: `Lantai ${idx + 1}`,
    rooms: [],
  };
}

export default function App() {
  const { user, loading: authLoading, signOut } = useAuth();
  const {
    savedProjects,
    currentProjectId,
    loadingProjects,
    loadProjects,
    saveProject,
    debouncedSave,
    flushPendingSave,
    deleteProject,
    selectProject,
    saveRabReport,
    fetchAndRestoreProject,
  } = useProjectStorage(user?.id);

  const [step, setStep] = useState<StepId>('project');
  const [completed, setCompleted] = useState<Set<StepId>>(new Set());
  const [project, setProject] = useState<ProjectState>(createInitialProject);
  const [floorCount, setFloorCount] = useState(1);
  const [floors, setFloors] = useState<Floor[]>([createFloor(0)]);
  const [detectionTarget, setDetectionTarget] = useState<{ floorId: string; roomId: string } | null>(null);
  const [showProjectMenu, setShowProjectMenu] = useState(false);
  const [restoring, setRestoring] = useState(false);

  // Load saved project when selected
  const restoreProject = useCallback((saved: SavedProject) => {
    setRestoring(true);
    const data = saved.project_data;
    setProject(data.project ?? createInitialProject());
    setFloors(data.floors ?? [createFloor(0)]);
    setFloorCount(data.floorCount ?? 1);
    setStep(data.step ?? 'project');
    setCompleted(new Set(data.completed ?? []));
    setRestoring(false);
  }, []);

  // Auto-load most recent project on first mount after projects are fetched
  useEffect(() => {
    if (savedProjects.length > 0 && currentProjectId && !restoring) {
      const found = savedProjects.find((p) => p.id === currentProjectId);
      if (found && found.project_data?.project) {
        restoreProject(found);
      }
    }
  }, [savedProjects, currentProjectId, restoring, restoreProject]);

  // Debounced auto-save on state change
  useEffect(() => {
    if (!user || !currentProjectId || restoring) return;
    const data: ProjectData = {
      project,
      floors,
      floorCount,
      step,
      completed: Array.from(completed),
    };
    debouncedSave(data, currentProjectId);
  }, [project, floors, floorCount, step, completed, user, currentProjectId, restoring, debouncedSave]);

  const updateProject = (patch: Partial<ProjectState>) => setProject((p) => ({ ...p, ...patch }));

  const applyFloorCount = (count: number) => {
    setFloorCount(count);
    setFloors((prev) => {
      if (count === prev.length) return prev;
      if (count > prev.length) {
        const additions = Array.from({ length: count - prev.length }, (_, i) => createFloor(prev.length + i));
        return [...prev, ...additions];
      }
      return prev.slice(0, count);
    });
  };

  const goToStep = (target: StepId) => setStep(target);

  const advance = () => {
    const idx = STEP_ORDER.indexOf(step);
    setCompleted((c) => new Set(c).add(step));
    if (idx < STEP_ORDER.length - 1) setStep(STEP_ORDER[idx + 1]);
  };

  const goBack = () => {
    const idx = STEP_ORDER.indexOf(step);
    if (idx > 0) setStep(STEP_ORDER[idx - 1]);
  };

  const restart = () => {
    setProject(createInitialProject());
    setFloorCount(1);
    setFloors([createFloor(0)]);
    setCompleted(new Set());
    setStep('project');
  };

  const startNewProject = async () => {
    flushPendingSave();
    restart();
    const data: ProjectData = {
      project: createInitialProject(),
      floors: [createFloor(0)],
      floorCount: 1,
      step: 'project',
      completed: [],
    };
    const newId = await saveProject(data, null);
    if (newId) {
      await loadProjects();
      selectProject(newId);
    }
    setShowProjectMenu(false);
  };

  const handleSelectProject = async (proj: SavedProject) => {
    flushPendingSave();
    selectProject(proj.id);
    const latestData = await fetchAndRestoreProject(proj.id);
    if (latestData) {
      restoreProject(latestData);
    }
    setShowProjectMenu(false);
  };

  const handleDeleteProject = async (e: React.MouseEvent, projId: string) => {
    e.stopPropagation();
    await deleteProject(projId);
    if (currentProjectId === projId) {
      const remaining = savedProjects.filter((p) => p.id !== projId);
      if (remaining.length > 0) {
        handleSelectProject(remaining[0]);
      } else {
        restart();
      }
    }
  };

  const handleSaveRab = useCallback(async () => {
    const allParts = floors.flatMap((f) => f.rooms.flatMap((r) => r.parts));
    const grandTotal = allParts.reduce((s, p) => s + p.price * p.quantity, 0);
    const totalQty = allParts.reduce((s, p) => s + p.quantity, 0);
    return saveRabReport({
      project,
      floors,
      grandTotal,
      totalItems: allParts.length,
      totalQty,
    });
  }, [project, floors, saveRabReport]);

  const handleDetectionConfirm = (parts: PartItem[]) => {
    if (!detectionTarget) return;
    const { floorId, roomId } = detectionTarget;
    setFloors((prev) =>
      prev.map((f) =>
        f.id === floorId
          ? {
              ...f,
              rooms: f.rooms.map((r) =>
                r.id === roomId
                  ? { ...r, parts: [...r.parts, ...parts], detectionStatus: 'done' as const }
                  : r,
              ),
            }
          : f,
      ),
    );
    setDetectionTarget(null);
  };

  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <Loader2 className="h-8 w-8 animate-spin text-brand-600" />
      </div>
    );
  }

  if (!user) {
    return <AuthScreen />;
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/80 backdrop-blur-lg print:hidden">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-6">
          <div className="flex items-center gap-2.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-glow">
              <Zap className="h-5 w-5" fill="currentColor" />
            </div>
            <div>
              <h1 className="text-base font-bold leading-tight text-slate-900">VoltRAB</h1>
              <p className="text-xs text-slate-500">RAB Kelistrikan & Deteksi SLD</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="hidden items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700 sm:flex">
              <ShieldCheck className="h-3.5 w-3.5" />
              YOLOv8 + OCR
            </div>

            {/* Project switcher */}
            <div className="relative">
              <button
                onClick={() => setShowProjectMenu(!showProjectMenu)}
                className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
              >
                <FolderOpen className="h-4 w-4 text-brand-600" />
                <span className="hidden max-w-[120px] truncate sm:inline">
                  {project.name || 'Project Tanpa Nama'}
                </span>
                <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
              </button>
              {showProjectMenu && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setShowProjectMenu(false)} />
                  <div className="absolute right-0 top-full z-50 mt-1 w-72 animate-scale-in rounded-xl border border-slate-200 bg-white shadow-card">
                    <div className="border-b border-slate-100 px-3 py-2">
                      <button
                        onClick={startNewProject}
                        className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-brand-600 transition-colors hover:bg-brand-50"
                      >
                        <Plus className="h-4 w-4" />
                        Project Baru
                      </button>
                    </div>
                    <div className="max-h-64 overflow-y-auto py-1">
                      {loadingProjects && (
                        <div className="flex items-center justify-center py-4">
                          <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
                        </div>
                      )}
                      {!loadingProjects && savedProjects.length === 0 && (
                        <div className="px-3 py-4 text-center text-sm text-slate-400">
                          Belum ada project tersimpan
                        </div>
                      )}
                      {savedProjects.map((proj) => (
                        <div
                          key={proj.id}
                          onClick={() => handleSelectProject(proj)}
                          className={`group flex cursor-pointer items-center justify-between gap-2 px-3 py-2 transition-colors hover:bg-slate-50 ${
                            proj.id === currentProjectId ? 'bg-brand-50' : ''
                          }`}
                        >
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-sm font-medium text-slate-700">
                              {proj.name}
                            </div>
                            <div className="text-xs text-slate-400">
                              {new Date(proj.updated_at).toLocaleDateString('id-ID', {
                                day: 'numeric',
                                month: 'short',
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </div>
                          </div>
                          <button
                            onClick={(e) => handleDeleteProject(e, proj.id)}
                            className="rounded p-1 text-slate-300 opacity-0 transition-all hover:bg-rose-50 hover:text-rose-500 group-hover:opacity-100"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* User menu */}
            <div className="flex items-center gap-2">
              <div className="hidden text-right sm:block">
                <div className="text-xs font-medium text-slate-700">{user.email}</div>
                <div className="text-xs text-slate-400">Akun Aktif</div>
              </div>
              <button
                onClick={signOut}
                className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-rose-50 hover:text-rose-600"
                aria-label="Keluar"
                title="Keluar"
              >
                <LogOut className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Hero (only on first step) */}
      {step === 'project' && (
        <section className="relative overflow-hidden border-b border-slate-200 bg-gradient-to-br from-brand-900 via-brand-800 to-slate-900 print:hidden">
          <div className="absolute inset-0 bg-grid opacity-20" />
          <div className="absolute -right-20 -top-20 h-72 w-72 rounded-full bg-brand-500/20 blur-3xl" />
          <div className="absolute -bottom-32 left-1/3 h-72 w-72 rounded-full bg-accent-500/10 blur-3xl" />
          <div className="relative mx-auto max-w-6xl px-4 py-12 sm:px-6 sm:py-16">
            <div className="max-w-2xl">
              <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-medium text-brand-100 ring-1 ring-white/20">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent-400" />
                Sistem Perhitungan RAB Otomatis
              </div>
              <h2 className="text-3xl font-bold leading-tight text-white sm:text-4xl">
                Hitung RAB Kelistrikan,
                <span className="block bg-gradient-to-r from-brand-200 to-accent-200 bg-clip-text text-transparent">
                  deteksi komponen dari SLD.
                </span>
              </h2>
              <p className="mt-4 text-base text-brand-100">
                Buat Rencana Anggaran Biaya kelistrikan profesional. Isi manual dari katalog, atau unggah diagram
                SLD dan biarkan YOLOv8 + OCR mendeteksi komponen secara otomatis.
              </p>
              <div className="mt-6 flex flex-wrap gap-6 text-sm text-brand-100">
                <div className="flex items-center gap-2">
                  <span className="text-lg font-bold text-white">5</span> Langkah
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-lg font-bold text-white">20+</span> Komponen Katalog
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-lg font-bold text-white">AI</span> Deteksi Otomatis
                </div>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Stepper */}
      <div className="sticky top-[57px] z-20 border-b border-slate-200 bg-white/90 backdrop-blur-lg print:hidden">
        <div className="mx-auto max-w-6xl px-4 py-4 sm:px-6">
          <Stepper current={step} completed={completed} onStepClick={goToStep} />
        </div>
      </div>

      {/* Main content */}
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
        {step === 'project' && (
          <ProjectStep
            project={project}
            onChange={updateProject}
            floorCount={floorCount}
            onFloorCountChange={applyFloorCount}
            onNext={advance}
          />
        )}
        {step === 'floors' && (
          <FloorsStep floors={floors} onChange={setFloors} onNext={advance} onBack={goBack} floorCount={floorCount} onFloorCountChange={applyFloorCount} />
        )}
        {step === 'parts' && (
          <PartsStep
            floors={floors}
            onChange={setFloors}
            onNext={advance}
            onBack={goBack}
            onOpenDetection={(floorId, roomId) => setDetectionTarget({ floorId, roomId })}
          />
        )}
        {step === 'summary' && (
          <SummaryStep
            project={project}
            floors={floors}
            onBack={goBack}
            onRestart={restart}
            onSaveRab={handleSaveRab}
          />
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-200 bg-white py-6 print:hidden">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-2 px-4 text-sm text-slate-500 sm:flex-row sm:px-6">
          <div className="flex items-center gap-2">
            <Zap className="h-4 w-4 text-brand-600" fill="currentColor" />
            <span className="font-medium text-slate-600">VoltRAB</span>
            <span>— Perhitungan RAB Kelistrikan</span>
          </div>
          <p>Backend: FastAPI · Deteksi: YOLOv8 + OCR</p>
        </div>
      </footer>

      <DetectionModal
        open={detectionTarget !== null}
        onClose={() => setDetectionTarget(null)}
        onConfirm={handleDetectionConfirm}
      />
    </div>
  );
}
