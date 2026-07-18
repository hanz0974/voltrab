import { useCallback, useEffect, useState } from 'react';
import { AlertCircle, CheckCircle2, ChevronDown, Download, Loader2, RefreshCw, Send } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface DetectionFeedbackReport {
  id: string;
  reporter_email: string | null;
  project_name: string;
  floor_name: string | null;
  room_name: string | null;
  complaint: string;
  detection_image: string | null;
  detections: unknown;
  report_source: 'user' | 'system' | null;
  error_type: string | null;
  system_report: Record<string, unknown> | null;
  status: 'open' | 'reviewed' | 'resolved';
  admin_note: string | null;
  created_at: string;
}

export function ReportsManager() {
  const [reports, setReports] = useState<DetectionFeedbackReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [expandedReportId, setExpandedReportId] = useState<string | null>(null);

  const fetchReports = useCallback(async () => {
    setLoading(true);
    setError(null);

    const { data, error: fetchError } = await supabase
      .from('detection_feedback_reports')
      .select('id, reporter_email, project_name, floor_name, room_name, complaint, detection_image, detections, report_source, error_type, system_report, status, admin_note, created_at')
      .order('created_at', { ascending: false });

    if (fetchError) {
      setError(fetchError.message || 'Gagal memuat laporan.');
      setReports([]);
      setLoading(false);
      return;
    }

    setReports((data ?? []) as DetectionFeedbackReport[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    void fetchReports();
  }, [fetchReports]);

  const setStatus = async (reportId: string, status: DetectionFeedbackReport['status']) => {
    setSavingId(reportId);
    const { error: updateError } = await supabase
      .from('detection_feedback_reports')
      .update({ status })
      .eq('id', reportId);

    if (updateError) {
      setError(updateError.message || 'Gagal memperbarui status report.');
      setSavingId(null);
      return;
    }

    setReports((prev) => prev.map((item) => (item.id === reportId ? { ...item, status } : item)));
    setSavingId(null);
  };

  const downloadDetectionImage = async (report: DetectionFeedbackReport) => {
    if (!report.detection_image) return;

    try {
      const response = await fetch(report.detection_image);
      if (!response.ok) {
        throw new Error('Gagal mengambil file gambar.');
      }

      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      const ext = blob.type.includes('png') ? 'png' : blob.type.includes('webp') ? 'webp' : 'jpg';
      const baseName = (report.project_name || 'project').replace(/[^a-zA-Z0-9-_]+/g, '_').slice(0, 40) || 'project';
      const fileName = `report-${baseName}-${report.id.slice(0, 8)}.${ext}`;

      link.href = objectUrl;
      link.download = fileName;
      link.click();
      URL.revokeObjectURL(objectUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal mengunduh gambar report.');
    }
  };

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Report Deteksi</h2>
          <p className="mt-1 text-slate-600">Daftar keluhan user ketika hasil deteksi tidak sesuai.</p>
        </div>
        <button
          onClick={() => {
            void fetchReports();
          }}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
        >
          <RefreshCw className="h-4 w-4" />
          Refresh
        </button>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-brand-600" />
        </div>
      ) : reports.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 py-12 text-center text-sm text-slate-500">
          Belum ada report dari user.
        </div>
      ) : (
        <div className="space-y-4">
          {reports.map((report) => {
            const detectionCount = Array.isArray(report.detections) ? report.detections.length : 0;
            const isExpanded = expandedReportId === report.id;

            return (
              <div key={report.id} className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                <button
                  type="button"
                  onClick={() => setExpandedReportId((prev) => (prev === report.id ? null : report.id))}
                  className="flex w-full flex-wrap items-start justify-between gap-3 bg-slate-50 px-4 py-3 text-left transition-colors hover:bg-slate-100"
                >
                  <div>
                    <h3 className="text-sm font-semibold text-slate-900">
                      {report.project_name || 'Project Tanpa Nama'}
                    </h3>
                    <p className="text-xs text-slate-500">
                      {report.floor_name || '-'} · {report.room_name || '-'} · {new Date(report.created_at).toLocaleString('id-ID')}
                    </p>
                    <p className="mt-0.5 text-xs text-slate-500">User: {report.reporter_email || '-'}</p>
                    <p className="mt-1 line-clamp-1 text-xs text-slate-600">{report.complaint}</p>
                    <div className="mt-1 flex items-center gap-2">
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                          report.report_source === 'system'
                            ? 'bg-violet-100 text-violet-700'
                            : 'bg-sky-100 text-sky-700'
                        }`}
                      >
                        {report.report_source === 'system' ? 'System Report' : 'User Report'}
                      </span>
                      {report.error_type && (
                        <span className="text-[11px] text-slate-500">Error: {report.error_type}</span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <span
                      className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                        report.status === 'resolved'
                          ? 'bg-emerald-100 text-emerald-700'
                          : report.status === 'reviewed'
                            ? 'bg-amber-100 text-amber-700'
                            : 'bg-rose-100 text-rose-700'
                      }`}
                    >
                      {report.status === 'open' ? 'Open' : report.status === 'reviewed' ? 'Reviewed' : 'Resolved'}
                    </span>
                    <ChevronDown className={`h-4 w-4 text-slate-500 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                  </div>
                </button>

                {isExpanded && (
                  <div className="grid gap-4 border-t border-slate-100 p-4 lg:grid-cols-[280px_1fr]">
                  <div>
                    <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Gambar Deteksi
                    </div>
                    <div className="overflow-hidden rounded-lg border border-slate-200 bg-slate-100">
                      {report.detection_image ? (
                        <img src={report.detection_image} alt="Report deteksi" className="block w-full" />
                      ) : (
                        <div className="flex h-40 items-center justify-center text-xs text-slate-500">Tidak ada gambar</div>
                      )}
                    </div>
                    <div className="mt-2 flex items-center justify-between gap-2">
                      <div className="text-xs text-slate-500">Jumlah objek terdeteksi: {detectionCount}</div>
                      {report.detection_image && (
                        <button
                          type="button"
                          className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-medium text-slate-600 transition-colors hover:bg-slate-50"
                          onClick={() => {
                            void downloadDetectionImage(report);
                          }}
                        >
                          <Download className="h-3.5 w-3.5" />
                          Download
                        </button>
                      )}
                    </div>
                  </div>

                  <div>
                    <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                      <AlertCircle className="h-3.5 w-3.5" />
                      Keluhan User
                    </div>
                    <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-700">
                      {report.complaint}
                    </div>

                    {report.system_report && Object.keys(report.system_report).length > 0 && (
                      <div className="mt-3 rounded-lg border border-slate-200 bg-white p-3">
                        <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                          Report Keluaran Sistem
                        </div>
                        <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-words rounded-md bg-slate-900 p-2 text-[11px] text-slate-100">
                          {JSON.stringify(report.system_report, null, 2)}
                        </pre>
                      </div>
                    )}

                    <div className="mt-4 flex flex-wrap gap-2">
                      <button
                        type="button"
                        className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-700 hover:bg-amber-100"
                        disabled={savingId === report.id}
                        onClick={() => {
                          void setStatus(report.id, 'reviewed');
                        }}
                      >
                        {savingId === report.id ? (
                          <span className="inline-flex items-center gap-1.5">
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            Menyimpan...
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5">
                            <Send className="h-3.5 w-3.5" />
                            Tandai Reviewed
                          </span>
                        )}
                      </button>

                      <button
                        type="button"
                        className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-700 hover:bg-emerald-100"
                        disabled={savingId === report.id}
                        onClick={() => {
                          void setStatus(report.id, 'resolved');
                        }}
                      >
                        <span className="inline-flex items-center gap-1.5">
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          Tandai Resolved
                        </span>
                      </button>
                    </div>
                  </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
