import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Brain,
  Upload,
  FileCode,
  Trash2,
  Check,
  X,
  Loader2,
  AlertCircle,
  Info,
  ExternalLink,
  Play,
  RefreshCw,
} from 'lucide-react';
import { supabase } from '../lib/supabase';

interface YoloModel {
  id: string;
  name: string;
  description: string | null;
  version: string | null;
  file_path: string | null;
  file_size: number | null;
  is_active: boolean;
  uploaded_by: string | null;
  created_at: string;
  updated_at: string;
}

interface TrainingSession {
  reportIds: string[];
  baselineModelIds: string[];
  startedAt: string;
}

interface TrainingStats {
  ready: number;
  missingAnnotation: number;
}

const COLAB_TRAINING_URL = 'https://colab.research.google.com/drive/1s9a4hDn1Dl6FoeOCFKHB3VQ0SmJGn00r?usp=sharing';
const TRAINING_SESSION_KEY = 'voltrab-yolo-training-session';
const MIN_TRAINING_REPORTS = 4;

function readTrainingSession(): TrainingSession | null {
  if (typeof window === 'undefined') return null;
  try {
    const value = window.localStorage.getItem(TRAINING_SESSION_KEY);
    return value ? JSON.parse(value) as TrainingSession : null;
  } catch {
    return null;
  }
}

const formatFileSize = (bytes: number | null): string => {
  if (!bytes) return '-';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

export function ModelsManager() {
  const [models, setModels] = useState<YoloModel[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    name: '',
    description: '',
    version: '',
  });
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [startingTraining, setStartingTraining] = useState(false);
  const [trainingSession, setTrainingSession] = useState<TrainingSession | null>(() => readTrainingSession());
  const [trainingMessage, setTrainingMessage] = useState<string | null>(null);
  const [trainingStats, setTrainingStats] = useState<TrainingStats>({ ready: 0, missingAnnotation: 0 });
  const [loadingTrainingStats, setLoadingTrainingStats] = useState(true);
  const [showTrainingConfirm, setShowTrainingConfirm] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadTrainingStats = useCallback(async () => {
    setLoadingTrainingStats(true);
    const { data, error: statsError } = await supabase
      .from('detection_feedback_reports')
      .select('system_report')
      .eq('report_source', 'user')
      .in('status', ['open', 'reviewed']);

    if (statsError) {
      setError(statsError.message || 'Gagal membaca kesiapan dataset.');
      setLoadingTrainingStats(false);
      return;
    }

    let ready = 0;
    let missingAnnotation = 0;
    for (const report of data ?? []) {
      const annotations = (report.system_report as Record<string, unknown> | null)?.training_annotations;
      if (Array.isArray(annotations) && annotations.length > 0) ready += 1;
      else missingAnnotation += 1;
    }
    setTrainingStats({ ready, missingAnnotation });
    setLoadingTrainingStats(false);
  }, []);

  const finishTrainingSession = useCallback(async (session: TrainingSession) => {
    const { error: resolveError } = await supabase
      .from('detection_feedback_reports')
      .update({ status: 'resolved' })
      .in('id', session.reportIds)
      .eq('status', 'reviewed');

    if (resolveError) {
      setError(resolveError.message || 'Model sudah masuk, tetapi status report gagal diperbarui.');
      return;
    }

    window.localStorage.removeItem(TRAINING_SESSION_KEY);
    setTrainingSession(null);
    setTrainingMessage(`${session.reportIds.length} report training otomatis ditandai resolved.`);
    await loadTrainingStats();
  }, [loadTrainingStats]);

  const fetchModels = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    const { data, error } = await supabase
      .from('yolo_models')
      .select('*')
      .order('created_at', { ascending: false });
    if (!error && data) {
      const fetchedModels = data as YoloModel[];
      setModels(fetchedModels);

      const session = readTrainingSession();
      const uploadedTrainingModel = session && fetchedModels.find((model) => (
        !session.baselineModelIds.includes(model.id)
        && model.file_path?.startsWith('training/')
      ));
      if (session && uploadedTrainingModel) {
        await finishTrainingSession(session);
      }
    } else if (error && !silent) {
      setError(error.message || 'Gagal memuat daftar model.');
    }
    if (!silent) setLoading(false);
  }, [finishTrainingSession]);

  useEffect(() => {
    void fetchModels();
    void loadTrainingStats();
  }, [fetchModels, loadTrainingStats]);

  useEffect(() => {
    if (!trainingSession) return;
    const intervalId = window.setInterval(() => {
      void fetchModels(true);
    }, 15000);
    const checkAfterFocus = () => {
      void fetchModels(true);
      void loadTrainingStats();
    };
    window.addEventListener('focus', checkAfterFocus);
    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener('focus', checkAfterFocus);
    };
  }, [fetchModels, loadTrainingStats, trainingSession]);

  const handleStartTraining = async () => {
    setShowTrainingConfirm(false);
    const colabWindow = window.open('about:blank', '_blank');
    if (!colabWindow) {
      setError('Popup diblokir browser. Izinkan popup untuk membuka Google Colab.');
      return;
    }

    setStartingTraining(true);
    setError(null);
    setTrainingMessage(null);

    try {
      const { data: reports, error: reportsError } = await supabase
        .from('detection_feedback_reports')
        .select('id, system_report, status')
        .eq('report_source', 'user')
        .in('status', ['open', 'reviewed']);
      if (reportsError) throw reportsError;

      const { data: baselineModels, error: baselineError } = await supabase
        .from('yolo_models')
        .select('id');
      if (baselineError) throw baselineError;

      const eligibleReportIds = (reports ?? [])
        .filter((report) => {
          const annotations = (report.system_report as Record<string, unknown> | null)?.training_annotations;
          return Array.isArray(annotations) && annotations.length > 0;
        })
        .map((report) => report.id as string);

      if (eligibleReportIds.length < MIN_TRAINING_REPORTS) {
        throw new Error(
          `Butuh minimal ${MIN_TRAINING_REPORTS} report beranotasi. Saat ini baru ada ${eligibleReportIds.length}.`,
        );
      }

      const { error: reviewError } = await supabase
        .from('detection_feedback_reports')
        .update({ status: 'reviewed' })
        .in('id', eligibleReportIds)
        .eq('status', 'open');
      if (reviewError) throw reviewError;

      const session: TrainingSession = {
        reportIds: eligibleReportIds,
        baselineModelIds: (baselineModels ?? []).map((model) => model.id as string),
        startedAt: new Date().toISOString(),
      };
      window.localStorage.setItem(TRAINING_SESSION_KEY, JSON.stringify(session));
      setTrainingSession(session);
      setTrainingMessage(`${eligibleReportIds.length} report ditandai reviewed. Menunggu model dari Colab.`);
      setTrainingStats((current) => ({ ...current, ready: eligibleReportIds.length }));
      colabWindow.location.href = COLAB_TRAINING_URL;
    } catch (err) {
      colabWindow.close();
      setError(err instanceof Error ? err.message : 'Gagal menyiapkan training.');
    } finally {
      setStartingTraining(false);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (!file.name.endsWith('.onnx')) {
        setError('File harus berformat .onnx');
        return;
      }
      setSelectedFile(file);
      setForm((f) => ({
        ...f,
        name: f.name || file.name.replace('.onnx', ''),
      }));
    }
  };

  const handleUpload = async () => {
    if (!selectedFile) {
      setError('Pilih file model .onnx');
      return;
    }
    if (!form.name.trim()) {
      setError('Nama model wajib diisi');
      return;
    }

    setUploading(true);
    setError(null);

    try {
      const fileExt = selectedFile.name.split('.').pop();
      const fileName = `${Date.now()}-${Math.random().toString(36).slice(2)}.${fileExt}`;
      const filePath = `models/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('yolo-models')
        .upload(filePath, selectedFile, {
          contentType: 'application/octet-stream',
          upsert: false,
        });

      if (uploadError) {
        if (uploadError.message.includes('Bucket not found')) {
          throw new Error('Storage bucket belum dikonfigurasi. Silakan hubungi administrator.');
        }
        throw uploadError;
      }

      const { data: insertedModel, error: insertError } = await supabase
        .from('yolo_models')
        .insert({
          name: form.name.trim(),
          description: form.description.trim() || null,
          version: form.version.trim() || null,
          file_path: filePath,
          file_size: selectedFile.size,
          is_active: false,
        })
        .select('id')
        .single();

      if (insertError) throw insertError;

      const { error: activateError } = await supabase.rpc('set_active_yolo_model', {
        p_model_id: insertedModel.id,
      });

      if (activateError) throw activateError;

      await fetchModels();
      closeForm();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal mengupload model');
    } finally {
      setUploading(false);
    }
  };

  const handleSetActive = async (model: YoloModel) => {
    setError(null);
    const { error } = await supabase.rpc('set_active_yolo_model', {
      p_model_id: model.id,
    });

    if (error) {
      setError(error.message || 'Gagal mengaktifkan model');
      return;
    }

    await fetchModels();
  };

  const handleDelete = async (id: string) => {
    const model = models.find((m) => m.id === id);
    if (model?.file_path) {
      await supabase.storage.from('yolo-models').remove([model.file_path]);
    }
    const { error } = await supabase.from('yolo_models').delete().eq('id', id);
    if (!error) {
      setModels((prev) => prev.filter((m) => m.id !== id));
    }
    setDeleteConfirm(null);
  };

  const closeForm = () => {
    setShowForm(false);
    setSelectedFile(null);
    setForm({ name: '', description: '', version: '' });
    setError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const activeModel = models.find((m) => m.is_active);
  const inactiveModels = models.filter((model) => !model.is_active);
  const trainingCandidate = models.find((model) => !model.is_active && model.file_path?.startsWith('training/'));
  const workflowStep = trainingSession ? 2 : trainingCandidate ? 3 : 1;

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Model YOLOv8</h2>
          <p className="mt-1 text-slate-600">Review dataset, jalankan training, lalu uji dan aktifkan model.</p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-600 shadow-sm transition-colors hover:bg-slate-50"
        >
          <Upload className="h-4 w-4" />
          Upload Manual
        </button>
      </div>

      {error && !showForm && (
        <div className="mb-5 flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
          <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
          {error}
        </div>
      )}
      {trainingMessage && (
        <div className="mb-5 flex items-start gap-2 rounded-lg border border-sky-200 bg-sky-50 p-3 text-sm text-sky-700">
          <Info className="mt-0.5 h-4 w-4 flex-shrink-0" />
          {trainingMessage}
        </div>
      )}

      <section className="mb-6 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 bg-slate-50/80 px-5 py-4">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="font-semibold text-slate-900">Alur Training Model</h3>
              <p className="text-sm text-slate-500">Selesaikan tiga tahap ini untuk memperbarui model deteksi.</p>
            </div>
            <span className="mt-2 w-fit rounded-full bg-brand-50 px-3 py-1 text-xs font-semibold text-brand-700 sm:mt-0">
              Tahap {workflowStep} dari 3
            </span>
          </div>
        </div>

        <div className="grid gap-0 md:grid-cols-3">
          {[
            { number: 1, title: 'Siapkan Data', description: 'Bounding box user direview' },
            { number: 2, title: 'Training', description: 'Proses model di Google Colab' },
            { number: 3, title: 'Uji & Aktifkan', description: 'Validasi model kandidat' },
          ].map((step) => {
            const completed = workflowStep > step.number;
            const current = workflowStep === step.number;
            return (
              <div
                key={step.number}
                className={`flex items-center gap-3 border-slate-100 p-4 md:border-r md:last:border-r-0 ${current ? 'bg-brand-50/60' : ''}`}
              >
                <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold ${
                  completed
                    ? 'bg-emerald-500 text-white'
                    : current
                      ? 'bg-brand-600 text-white'
                      : 'bg-slate-100 text-slate-400'
                }`}>
                  {completed ? <Check className="h-4 w-4" /> : step.number}
                </div>
                <div>
                  <div className={`text-sm font-semibold ${current ? 'text-brand-800' : 'text-slate-700'}`}>{step.title}</div>
                  <div className="text-xs text-slate-500">{step.description}</div>
                </div>
              </div>
            );
          })}
        </div>

        <div className="border-t border-slate-100 p-5">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl bg-emerald-50 p-4">
              <div className="text-2xl font-bold text-emerald-700">
                {loadingTrainingStats ? '—' : trainingStats.ready}
              </div>
              <div className="text-sm font-medium text-emerald-700">Report siap training</div>
            </div>
            <div className="rounded-xl bg-amber-50 p-4">
              <div className="text-2xl font-bold text-amber-700">
                {loadingTrainingStats ? '—' : trainingStats.missingAnnotation}
              </div>
              <div className="text-sm font-medium text-amber-700">Belum ada bounding box</div>
            </div>
            <div className="rounded-xl bg-slate-50 p-4">
              <div className="text-2xl font-bold text-slate-700">{MIN_TRAINING_REPORTS}</div>
              <div className="text-sm font-medium text-slate-600">Minimum dataset</div>
            </div>
          </div>

          <div className="mt-4 flex flex-col gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="text-sm font-semibold text-slate-800">
                {trainingSession
                  ? 'Menunggu model ONNX dari Google Colab'
                  : trainingCandidate
                    ? `Model kandidat tersedia: ${trainingCandidate.name}`
                    : trainingStats.ready >= MIN_TRAINING_REPORTS
                      ? 'Dataset sudah cukup untuk memulai training'
                      : `Tambahkan ${Math.max(0, MIN_TRAINING_REPORTS - trainingStats.ready)} report beranotasi lagi`}
              </div>
              <p className="mt-1 text-xs text-slate-500">
                {trainingSession
                  ? `${trainingSession.reportIds.length} report sedang dipantau sejak ${new Date(trainingSession.startedAt).toLocaleString('id-ID')}.`
                  : trainingCandidate
                    ? 'Uji model pada beberapa gambar sebelum menjadikannya model aktif.'
                    : 'Hanya report user dengan bounding box yang masuk dataset training.'}
              </p>
            </div>

            {trainingSession ? (
              <div className="flex shrink-0 flex-wrap gap-2">
                <a
                  href={COLAB_TRAINING_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 rounded-lg border border-amber-200 bg-white px-3 py-2 text-sm font-semibold text-amber-700 hover:bg-amber-50"
                >
                  Buka Colab <ExternalLink className="h-4 w-4" />
                </a>
                <button
                  type="button"
                  onClick={() => {
                    void fetchModels(true);
                  }}
                  className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-3 py-2 text-sm font-semibold text-white hover:bg-brand-700"
                >
                  <RefreshCw className="h-4 w-4" /> Cek Model
                </button>
              </div>
            ) : trainingCandidate ? (
              <button
                type="button"
                onClick={() => {
                  void handleSetActive(trainingCandidate);
                }}
                className="inline-flex shrink-0 items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700"
              >
                <Check className="h-4 w-4" /> Aktifkan Kandidat
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setShowTrainingConfirm(true)}
                disabled={loading || loadingTrainingStats || startingTraining || trainingStats.ready < MIN_TRAINING_REPORTS}
                className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Play className="h-4 w-4" /> Mulai Training
              </button>
            )}
          </div>
        </div>
      </section>

      {activeModel && (
        <div className="mb-6 flex items-center gap-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-100">
            <Brain className="h-6 w-6 text-emerald-600" />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-emerald-800">{activeModel.name}</span>
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">
                <Check className="h-3 w-3" />
                Aktif
              </span>
            </div>
            {activeModel.version && (
              <p className="text-sm text-emerald-600">Version {activeModel.version}</p>
            )}
          </div>
          <div className="text-right text-sm text-emerald-700">
            <div className="font-medium">{formatFileSize(activeModel.file_size)}</div>
            <div className="text-xs text-emerald-600">
              Uploaded {new Date(activeModel.created_at).toLocaleDateString('id-ID')}
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-brand-600" />
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-slate-900">Model Kandidat & Riwayat</h3>
              <p className="text-xs text-slate-500">Model belum aktif yang masih bisa diuji atau dihapus.</p>
            </div>
          </div>
          {models.length === 0 ? (
            <div className="rounded-xl border border-slate-200 bg-white py-12 text-center">
              <Brain className="mx-auto h-12 w-12 text-slate-300" />
              <p className="mt-3 text-sm text-slate-500">Belum ada model yang diupload.</p>
              <p className="mt-1 text-xs text-slate-400">
                Upload model YOLOv8 format ONNX untuk mulai mendeteksi komponen.
              </p>
            </div>
          ) : inactiveModels.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 py-8 text-center text-sm text-slate-500">
              Belum ada model kandidat. Model aktif tidak ditampilkan ulang di bagian ini.
            </div>
          ) : (
            <div className="grid gap-4">
              {inactiveModels.map((model) => (
                <div
                  key={model.id}
                  className={`rounded-xl border bg-white p-5 transition-all ${
                    model.is_active
                      ? 'border-emerald-200 ring-1 ring-emerald-200'
                      : 'border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-4">
                      <div
                        className={`flex h-12 w-12 items-center justify-center rounded-xl ${
                          model.is_active ? 'bg-emerald-100' : 'bg-slate-100'
                        }`}
                      >
                        <FileCode
                          className={`h-6 w-6 ${model.is_active ? 'text-emerald-600' : 'text-slate-500'}`}
                        />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="font-semibold text-slate-900">{model.name}</h3>
                          {model.is_active && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">
                              <Check className="h-3 w-3" />
                              Aktif
                            </span>
                          )}
                        </div>
                        {model.description && (
                          <p className="mt-1 text-sm text-slate-600">{model.description}</p>
                        )}
                        <div className="mt-2 flex flex-wrap gap-3 text-xs text-slate-500">
                          {model.version && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-1">
                              v{model.version}
                            </span>
                          )}
                          <span>{formatFileSize(model.file_size)}</span>
                          <span>{new Date(model.created_at).toLocaleDateString('id-ID')}</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {!model.is_active && (
                        <button
                          onClick={() => handleSetActive(model)}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-sm font-medium text-emerald-700 transition-colors hover:bg-emerald-100"
                        >
                          <Check className="h-4 w-4" />
                          Aktifkan
                        </button>
                      )}
                      <button
                        onClick={() => setDeleteConfirm(model.id)}
                        className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-rose-50 hover:text-rose-600"
                        title="Hapus"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {showTrainingConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <button
            type="button"
            aria-label="Tutup konfirmasi training"
            className="fixed inset-0 bg-black/50"
            onClick={() => setShowTrainingConfirm(false)}
          />
          <div className="relative w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <div className="flex items-start gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
                <Brain className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-slate-900">Mulai training model?</h3>
                <p className="mt-1 text-sm leading-relaxed text-slate-600">
                  {trainingStats.ready} report beranotasi akan ditandai reviewed, lalu Google Colab dibuka di tab baru.
                </p>
              </div>
            </div>

            <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
              Jangan tutup seluruh sesi browser sebelum model selesai diunggah. Dashboard akan otomatis memantau model baru.
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowTrainingConfirm(false)}
                className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={() => {
                  void handleStartTraining();
                }}
                disabled={startingTraining}
                className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60"
              >
                {startingTraining ? <Loader2 className="h-4 w-4 animate-spin" /> : <ExternalLink className="h-4 w-4" />}
                Lanjut ke Colab
              </button>
            </div>
          </div>
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/50" onClick={closeForm} />
          <div className="relative w-full max-w-lg rounded-xl bg-white p-6 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-slate-900">Upload Model YOLOv8</h3>
              <button
                onClick={closeForm}
                className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {error && (
              <div className="mb-4 flex items-center gap-2 rounded-lg bg-rose-50 p-3 text-sm text-rose-700">
                <AlertCircle className="h-4 w-4 flex-shrink-0" />
                {error}
              </div>
            )}

            <div className="space-y-4">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">File Model (.onnx)</label>
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className={`flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed p-8 transition-colors ${
                    selectedFile
                      ? 'border-emerald-300 bg-emerald-50'
                      : 'border-slate-300 bg-slate-50 hover:border-brand-400 hover:bg-brand-50'
                  }`}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".onnx"
                    onChange={handleFileSelect}
                    className="hidden"
                  />
                  {selectedFile ? (
                    <>
                      <FileCode className="h-10 w-10 text-emerald-500" />
                      <p className="mt-2 font-medium text-emerald-700">{selectedFile.name}</p>
                      <p className="text-sm text-emerald-600">{formatFileSize(selectedFile.size)}</p>
                    </>
                  ) : (
                    <>
                      <Upload className="h-10 w-10 text-slate-400" />
                      <p className="mt-2 font-medium text-slate-600">Klik untuk upload</p>
                      <p className="text-sm text-slate-500">File .onnx dari YOLOv8 export</p>
                    </>
                  )}
                </div>
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">Nama Model *</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                  placeholder="yolov8n-electrical-components"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">Versi</label>
                <input
                  type="text"
                  value={form.version}
                  onChange={(e) => setForm((f) => ({ ...f, version: e.target.value }))}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                  placeholder="1.0.0"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">Deskripsi</label>
                <textarea
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                  rows={3}
                  placeholder="Model untuk deteksi komponen SLD seperti MCB, MCCB, RCCB..."
                />
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={closeForm}
                className="rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
              >
                Batal
              </button>
              <button
                onClick={handleUpload}
                disabled={uploading || !selectedFile}
                className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-700 disabled:opacity-50"
              >
                {uploading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Upload className="h-4 w-4" />
                )}
                Upload
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/50" onClick={() => setDeleteConfirm(null)} />
          <div className="relative w-full max-w-sm rounded-xl bg-white p-6 shadow-xl">
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-rose-100">
              <Trash2 className="h-6 w-6 text-rose-600" />
            </div>
            <h3 className="text-lg font-semibold text-slate-900">Hapus Model?</h3>
            <p className="mt-2 text-sm text-slate-600">
              Tindakan ini tidak dapat dibatalkan. File model akan dihapus permanen.
            </p>
            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={() => setDeleteConfirm(null)}
                className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
              >
                Batal
              </button>
              <button
                onClick={() => handleDelete(deleteConfirm)}
                className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-rose-700"
              >
                Hapus
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
