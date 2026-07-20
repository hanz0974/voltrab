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
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchModels = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('yolo_models')
      .select('*')
      .order('created_at', { ascending: false });
    if (!error && data) {
      setModels(data as YoloModel[]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchModels();
  }, [fetchModels]);

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
        .upload(filePath, selectedFile);

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

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Model YOLOv8</h2>
          <p className="mt-1 text-slate-600">Upload dan kelola model deteksi komponen.</p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-brand-700"
        >
          <Upload className="h-4 w-4" />
          Upload Model
        </button>
      </div>

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
          {models.length === 0 ? (
            <div className="rounded-xl border border-slate-200 bg-white py-12 text-center">
              <Brain className="mx-auto h-12 w-12 text-slate-300" />
              <p className="mt-3 text-sm text-slate-500">Belum ada model yang diupload.</p>
              <p className="mt-1 text-xs text-slate-400">
                Upload model YOLOv8 format ONNX untuk mulai mendeteksi komponen.
              </p>
            </div>
          ) : (
            <div className="grid gap-4">
              {models.map((model) => (
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

      <div className="mt-8 space-y-4">
        <h3 className="text-lg font-semibold text-slate-900">Panduan Penyiapan Model</h3>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="flex flex-col justify-between rounded-xl border border-indigo-200 bg-indigo-50/60 p-5">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-indigo-100 text-indigo-600">
                <ExternalLink className="h-5 w-5" />
              </div>
              <div>
                <h4 className="font-semibold text-indigo-900">1. Anotasi Dataset dengan Roboflow</h4>
                <p className="mt-1 text-sm leading-relaxed text-indigo-700">
                  Sebelum melakukan training, siapkan dataset dan lakukan anotasi (labelling/bounding box) pada gambar komponen kelistrikan secara online menggunakan website <strong>Roboflow</strong>.
                </p>
              </div>
            </div>
            <div className="mt-4 pt-2">
              <a
                href="https://roboflow.com"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 py-2 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-indigo-700"
              >
                Buka Roboflow
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            </div>
          </div>

          <div className="flex flex-col justify-between rounded-xl border border-amber-200 bg-amber-50/60 p-5">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-amber-100 text-amber-600">
                <Brain className="h-5 w-5" />
              </div>
              <div>
                <h4 className="font-semibold text-amber-900">2. Training Model di Google Colab</h4>
                <p className="mt-1 text-sm leading-relaxed text-amber-700">
                  Latih model YOLOv8 menggunakan dataset dari Roboflow dan ekspor hasilnya ke format ONNX melalui notebook <strong>Google Colab</strong> yang telah disiapkan.
                </p>
              </div>
            </div>
            <div className="mt-4 pt-2">
              <a
                href="https://colab.research.google.com/drive/1uWeShtI6npyIX12_jcIC73m1Yk6s1kLS#scrollTo=tdSMcABDNKW-"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-lg bg-amber-600 px-3.5 py-2 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-amber-700"
              >
                Buka Google Colab
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-sky-200 bg-sky-50 p-5">
          <div className="flex gap-3">
            <Info className="h-5 w-5 flex-shrink-0 text-sky-600" />
            <div>
              <h4 className="font-medium text-sky-900">Format Model YOLOv8</h4>
              <p className="mt-1 text-sm text-sky-700">
                Model harus dalam format ONNX (.onnx) yang diekspor dari YOLOv8. Pastikan model sudah
                dilatih untuk mendeteksi komponen kelistrikan.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <span className="rounded bg-sky-100 px-2 py-1 text-xs font-medium text-sky-700">
                  .onnx
                </span>
                <span className="rounded bg-sky-100 px-2 py-1 text-xs font-medium text-sky-700">
                  YOLOv8n/s/m/l/x
                </span>
                <span className="rounded bg-sky-100 px-2 py-1 text-xs font-medium text-sky-700">
                  640x640 input
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

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
