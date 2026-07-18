import { useState, useRef, useEffect } from "react";
import {
  Upload,
  ScanLine,
  CheckCircle2,
  X,
  RefreshCw,
  AlertCircle,
  PencilIcon,
  Send,
  MessageSquareWarning,
} from "lucide-react";
import type { DetectionResult, PartItem, ComponentSpec } from "../types";
import { formatRupiah, uid } from "../data";
import { apiDetectImage } from "../lib/api";
import { Modal } from "./Modal";
import { supabase } from "../lib/supabase"; // SESUAIKAN PATH INI

interface DetectionModalProps {
  open: boolean;
  onClose: () => void;
  onConfirm: (parts: PartItem[]) => void;
  onComplete: (image: string, detections: DetectionResult[]) => void;
  projectName: string;
  floorName: string;
  roomName: string;
  catalogComponents: ComponentSpec[];
  catalogLoading: boolean;
}

const LABEL_TO_COMPONENT: Record<string, string> = {
  MCB: "c-mcb-16",
  MCCB: "c-mccb-100",
  RCCB: "c-rccb-40",
  "Kabel NYM": "c-kabel-nym-3x2.5",
  "Lampu LED": "c-led-18",
  "Stop Kontak": "c-stop-1",
  Saklar: "c-saklar-1",
  "Panel Box": "c-panel-box",
};

export function DetectionModal({
  open,
  onClose,
  onConfirm,
  onComplete,
  projectName,
  floorName,
  roomName,
  catalogComponents,
  catalogLoading,
}: DetectionModalProps) {
  const [stage, setStage] = useState<
    "upload" | "processing" | "done" | "error" | "manual"
  >("upload");
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [detections, setDetections] = useState<DetectionResult[]>([]);
  const [progress, setProgress] = useState(0);
  const [processingStep, setProcessingStep] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [manualSearch, setManualSearch] = useState("");
  const [manualSelected, setManualSelected] = useState<string[]>([]);
  const [manualQuantities, setManualQuantities] = useState<Record<string, number>>({});
  const [detectionValid, setDetectionValid] = useState<"yes" | "no" | null>(null);
  const [reportComplaint, setReportComplaint] = useState("");
  const [reportSending, setReportSending] = useState(false);
  const [reportSent, setReportSent] = useState(false);
  const [reportError, setReportError] = useState("");
  const [autoReportSent, setAutoReportSent] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const dragRef = useRef<HTMLDivElement>(null);

  const manualResults = catalogComponents.filter((component) =>
    component.name.toLowerCase().includes(manualSearch.toLowerCase()) ||
    component.category.toLowerCase().includes(manualSearch.toLowerCase()),
  );

  const toggleManualSelected = (id: string) => {
    setManualSelected((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id],
    );
  };

  const updateManualQuantity = (id: string, qty: number) => {
    setManualQuantities((prev) => ({
      ...prev,
      [id]: Math.max(1, qty),
    }));
  };

  useEffect(() => {
    if (!open) {
      setStage("upload");
      setImagePreview(null);
      setDetections([]);
      setProgress(0);
      setErrorMsg("");
      setManualSearch("");
      setManualSelected([]);
      setManualQuantities({});
      setDetectionValid(null);
      setReportComplaint("");
      setReportSending(false);
      setReportSent(false);
      setReportError("");
      setAutoReportSent(false);
    }
  }, [open]);

  const insertFeedbackReport = async (payload: Record<string, unknown>) => {
    const { error } = await supabase.from("detection_feedback_reports").insert(payload);

    // Compatibility fallback when new columns are not migrated yet.
    if (error && /column .* does not exist/i.test(error.message)) {
      const legacyPayload = {
        user_id: payload.user_id,
        reporter_email: payload.reporter_email,
        project_name: payload.project_name,
        floor_name: payload.floor_name,
        room_name: payload.room_name,
        complaint: payload.complaint,
        detection_image: payload.detection_image,
        detections: payload.detections,
        status: payload.status,
      };
      const { error: legacyError } = await supabase
        .from("detection_feedback_reports")
        .insert(legacyPayload);
      return legacyError;
    }

    return error;
  };

  const sendAutoErrorReport = async (params: {
    errorType: string;
    userMessage: string;
    file?: File;
    rawError?: unknown;
    detectionsPayload?: DetectionResult[];
    image?: string | null;
  }) => {
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      const user = session?.user;
      if (!user) return;

      const rawErrorMessage =
        params.rawError instanceof Error
          ? params.rawError.message
          : typeof params.rawError === "string"
            ? params.rawError
            : null;

      const systemReport = {
        source: "system",
        trigger: "detection_error",
        error_type: params.errorType,
        user_message: params.userMessage,
        raw_error: rawErrorMessage,
        stage,
        processing_step: processingStep,
        project_name: projectName || "Project Tanpa Nama",
        floor_name: floorName || null,
        room_name: roomName || null,
        file_name: params.file?.name ?? null,
        file_size: params.file?.size ?? null,
        file_type: params.file?.type ?? null,
        detection_count: (params.detectionsPayload ?? []).length,
        created_at: new Date().toISOString(),
      };

      const error = await insertFeedbackReport({
        user_id: user.id,
        reporter_email: user.email ?? null,
        project_name: projectName || "Project Tanpa Nama",
        floor_name: floorName || null,
        room_name: roomName || null,
        complaint: `[AUTO] ${params.userMessage}`,
        detection_image: params.image ?? imagePreview ?? null,
        detections: params.detectionsPayload ?? [],
        status: "open",
        report_source: "system",
        error_type: params.errorType,
        system_report: systemReport,
      });

      if (!error) {
        setAutoReportSent(true);
      }
    } catch {
      // Do not block user flow if report delivery fails.
    }
  };

  const runDetection = async (file: File, previewImage?: string) => {
    setStage("processing");
    setProgress(0);
    setProcessingStep("Mengunggah gambar ke server...");

    // Simulate progress steps while waiting for API
    const steps = [
      "Mengunggah gambar ke server...",
      "Menjalankan inferensi YOLOv8...",
      "Mendeteksi bounding box simbol...",
      "Menjalankan OCR pada label...",
      "Mencocokkan dengan katalog komponen...",
    ];
    let stepIdx = 0;
    const progressInterval = setInterval(() => {
      stepIdx = Math.min(stepIdx + 1, steps.length - 1);
      setProcessingStep(steps[stepIdx]);
      setProgress(Math.round((stepIdx / steps.length) * 80));
    }, 800);

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const token = session?.access_token;

      // 2. CEK APAKAH USER SUDAH LOGIN
      if (!token) {
        clearInterval(progressInterval);
        setStage("error");
        const message = "Sesi login tidak ditemukan. Silakan login ulang.";
        setErrorMsg(message);
        await sendAutoErrorReport({
          errorType: "missing_session_token",
          userMessage: message,
          file,
          image: previewImage ?? imagePreview,
        });
        return;
      }
      const result = await apiDetectImage(file, token);
      clearInterval(progressInterval);
      setProgress(100);
      setProcessingStep("Finalisasi hasil deteksi...");

      const results: DetectionResult[] = result.detections.map((d) => ({
        id: uid(),
        label: d.label,
        confidence: d.confidence,
        bbox: d.bbox,
        ocrText: d.ocr_text ?? undefined,
        matchedComponentId:
          d.matched_component_id ?? LABEL_TO_COMPONENT[d.label],
      }));

      if (results.length === 0) {
        setDetections([]);
        const message =
          "Tidak ada objek terdeteksi pada gambar. Silakan masukkan komponen secara manual.";
        setErrorMsg(message);
        setStage("error");
        await sendAutoErrorReport({
          errorType: "empty_detection_result",
          userMessage: message,
          file,
          detectionsPayload: results,
          image: result.image_url || previewImage || imagePreview,
        });
        return;
      }

      setDetections(results);

      const finalImage = result.image_url || previewImage || imagePreview || "";
      if (finalImage) {
        setImagePreview(finalImage);
      }
      setDetections(results);
      setStage("done");
      onComplete(finalImage, results);
    } catch (error) {
      clearInterval(progressInterval);
      setProgress(100);
      setProcessingStep("Finalisasi hasil deteksi...");
      const message =
        error instanceof Error && error.message
          ? `Deteksi otomatis gagal: ${error.message}`
          : "Deteksi otomatis gagal. Silakan masukkan komponen secara manual.";
      setErrorMsg(message);
      setDetections([]);
      setStage("error");
      await sendAutoErrorReport({
        errorType: "detection_runtime_error",
        userMessage: message,
        rawError: error,
        file,
        image: previewImage ?? imagePreview,
      });
    }
  };

  const handleFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const preview = e.target?.result as string;
      setImagePreview(preview);
      runDetection(file, preview);
    };
    reader.onerror = () => {
      const message = "Gagal membaca file gambar sebelum deteksi.";
      setStage("error");
      setErrorMsg(message);
      void sendAutoErrorReport({
        errorType: "file_read_error",
        userMessage: message,
        file,
        rawError: "FileReader onerror",
      });
    };
    reader.readAsDataURL(file);
  };

  const openManualEntry = () => {
    setStage("manual");
    setErrorMsg("");
  };

  const handleSendReport = async () => {
    if (detectionValid !== "no") return;

    const complaint = reportComplaint.trim();
    if (complaint.length < 5) {
      setReportError("Mohon isi keluhan minimal 5 karakter.");
      return;
    }

    setReportSending(true);
    setReportError("");

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      const user = session?.user;
      if (!user) {
        setReportError("Sesi login tidak ditemukan. Silakan login ulang.");
        return;
      }

      const error = await insertFeedbackReport({
        user_id: user.id,
        reporter_email: user.email ?? null,
        project_name: projectName || "Project Tanpa Nama",
        floor_name: floorName || null,
        room_name: roomName || null,
        complaint,
        detection_image: imagePreview || null,
        detections: detections,
        status: "open",
        report_source: "user",
        error_type: null,
        system_report: {
          source: "user",
          trigger: "manual_feedback",
          created_at: new Date().toISOString(),
          stage,
          processing_step: processingStep,
        },
      });

      if (error) {
        setReportError(error.message || "Gagal mengirim report ke admin.");
        return;
      }

      setReportSent(true);
    } finally {
      setReportSending(false);
    }
  };

  const updateDetection = (id: string, patch: Partial<DetectionResult>) => {
    setDetections((prev) =>
      prev.map((d) => (d.id === id ? { ...d, ...patch } : d)),
    );
  };

  const removeDetection = (id: string) => {
    setDetections((prev) => prev.filter((d) => d.id !== id));
  };

  const handleConfirm = () => {
    if (stage === "manual") {
      const parts: PartItem[] = manualSelected
        .map((id) => catalogComponents.find((c) => c.id === id))
        .filter((comp): comp is ComponentSpec => Boolean(comp))
        .map((comp) => ({
          id: uid(),
          componentId: comp.id,
          name: comp.name,
          category: comp.category,
          unit: comp.unit,
          quantity: manualQuantities[comp.id] ?? 1,
          price: comp.price,
        }));
      onConfirm(parts);
      return;
    }

    const parts: PartItem[] = detections
      .filter((d) => d.matchedComponentId)
      .map((d) => ({ detection: d, component: catalogComponents.find((c) => c.id === d.matchedComponentId) }))
      .filter((entry): entry is { detection: DetectionResult; component: ComponentSpec } => Boolean(entry.component))
      .map(({ detection, component }) => ({
        id: uid(),
        componentId: component.id,
        name: component.name,
        category: component.category,
        unit: component.unit,
        quantity: 1,
        price: component.price,
      }));
    onConfirm(parts);
  };

  const modalTitle = stage === "manual" ? "Input Manual Komponen" : "Deteksi Komponen SLD";
  const modalSubtitle =
    stage === "manual"
      ? "Pilih komponen dari katalog secara manual untuk ditambahkan ke RAB."
      : "Unggah diagram SLD, deteksi otomatis dengan YOLOv8 + OCR via FastAPI.";

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={modalTitle}
      subtitle={modalSubtitle}
      maxWidth="max-w-4xl"
    >
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
      />

      {stage === "upload" && (
        <div
          ref={dragRef}
          onDragOver={(e) => {
            e.preventDefault();
            dragRef.current?.classList.add(
              "border-brand-500",
              "bg-brand-50/40",
            );
          }}
          onDragLeave={() =>
            dragRef.current?.classList.remove(
              "border-brand-500",
              "bg-brand-50/40",
            )
          }
          onDrop={(e) => {
            e.preventDefault();
            dragRef.current?.classList.remove(
              "border-brand-500",
              "bg-brand-50/40",
            );
            if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]);
          }}
          className="rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50/40 py-12 text-center transition-all"
        >
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-100 text-brand-600">
            <Upload className="h-7 w-7" />
          </div>
          <h4 className="mt-4 text-base font-semibold text-slate-800">
            Unggah Diagram SLD
          </h4>
          <p className="mt-1 text-sm text-slate-500">
            Drag & drop gambar SLD ke sini, atau klik tombol di bawah. Gambar
            dikirim ke server FastAPI untuk diproses.
          </p>
          <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
            <button
              className="btn-primary"
              onClick={() => fileRef.current?.click()}
            >
              <Upload className="h-4 w-4" />
              Pilih File
            </button>
            <button className="btn-secondary" onClick={openManualEntry}>
              <PencilIcon className="h-4 w-4" />
              Input Manual
            </button>
          </div>
          <p className="mt-4 text-xs text-slate-400">
            Mendukung: PNG, JPG, JPEG, WEBP
          </p>
        </div>
      )}

      {stage === "processing" && (
        <div className="py-10">
          <div className="mx-auto max-w-md text-center">
            <div className="relative mx-auto h-20 w-20">
              <div className="absolute inset-0 rounded-full bg-brand-200 animate-pulse-ring" />
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-brand-600 text-white">
                  <ScanLine className="h-7 w-7" />
                </div>
              </div>
            </div>
            <h4 className="mt-6 text-base font-semibold text-slate-800">
              Memproses Diagram SLD
            </h4>
            <p className="mt-1 text-sm text-slate-500">{processingStep}</p>
            <div className="mt-5 h-2 w-full overflow-hidden rounded-full bg-slate-200">
              <div
                className="h-full rounded-full bg-gradient-to-r from-brand-500 to-brand-600 transition-all duration-500"
                style={{ width: `${progress}%` }}
              />
            </div>
            <div className="mt-2 font-mono text-sm font-semibold text-brand-700">
              {progress}%
            </div>
          </div>
        </div>
      )}

      {stage === "error" && (
        <div className="py-10">
          <div className="mx-auto max-w-md text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-rose-100 text-rose-600">
              <AlertCircle className="h-7 w-7" />
            </div>
            <h4 className="mt-4 text-base font-semibold text-slate-800">
              Deteksi Gagal
            </h4>
            <p className="mt-1 text-sm text-slate-500">{errorMsg}</p>
            <p className="mt-2 text-xs text-slate-400">
              Jika gambar tidak bisa dideteksi, Anda dapat memasukkan komponen secara manual.
            </p>
            {autoReportSent && (
              <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
                Laporan error deteksi otomatis sudah dikirim ke admin.
              </p>
            )}
            <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:justify-center">
              <button
                className="btn-primary"
                onClick={() => {
                  setStage("manual");
                }}
              >
                Input Manual
              </button>
              <button
                className="btn-secondary"
                onClick={() => setStage("upload")}
              >
                Unggah Ulang
              </button>
            </div>
          </div>
        </div>
      )}

      {stage === "manual" && (
        <div className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
            <div className="space-y-4">
              <div>
                <label className="label-base">Cari Komponen</label>
                <input
                  type="text"
                  value={manualSearch}
                  onChange={(e) => setManualSearch(e.target.value)}
                  placeholder="Cari nama atau kategori..."
                  className="input-base w-full"
                />
              </div>
              <div className="max-h-[55vh] overflow-y-auto rounded-3xl border border-slate-200 bg-white p-3">
                {catalogLoading ? (
                  <div className="py-12 text-center text-sm text-slate-500">Memuat katalog komponen...</div>
                ) : manualResults.length === 0 ? (
                  <div className="py-12 text-center text-sm text-slate-500">
                    Tidak ada komponen yang sesuai. Coba kata kunci lain.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {manualResults.map((comp) => {
                      const selected = manualSelected.includes(comp.id);
                      return (
                        <button
                          key={comp.id}
                          type="button"
                          onClick={() => toggleManualSelected(comp.id)}
                          className={`flex w-full items-center justify-between rounded-2xl border px-4 py-3 text-left transition-all ${
                            selected
                              ? 'border-brand-600 bg-brand-50'
                              : 'border-slate-200 bg-white hover:border-slate-300'
                          }`}
                        >
                          <div>
                            <div className="text-sm font-medium text-slate-900">
                              {comp.name}
                            </div>
                            <div className="text-xs text-slate-500">
                              {comp.category} · {formatRupiah(comp.price)} / {comp.unit}
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="rounded-full bg-slate-100 px-2 py-1 text-xs text-slate-600">
                              {selected ? 'Dipilih' : 'Pilih'}
                            </span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
              <div className="mb-3 flex items-center justify-between">
                <div>
                  <h4 className="text-sm font-semibold text-slate-800">Komponen Terpilih</h4>
                  <p className="text-xs text-slate-500">{manualSelected.length} komponen</p>
                </div>
                <button
                  type="button"
                  className="text-xs text-brand-600"
                  onClick={() => {
                    setManualSelected([]);
                    setManualQuantities({});
                  }}
                >
                  Kosongkan
                </button>
              </div>
              <div className="space-y-3">
                {manualSelected.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-4 text-center text-sm text-slate-500">
                    Pilih komponen dari daftar untuk menambahkan.
                  </div>
                ) : (
                  manualSelected
                    .map((id) => catalogComponents.find((c) => c.id === id))
                    .filter((comp): comp is ComponentSpec => Boolean(comp))
                    .map((comp) => (
                      <div key={comp.id} className="rounded-2xl border border-slate-200 bg-white p-3">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <div className="text-sm font-medium text-slate-900">{comp.name}</div>
                            <div className="text-xs text-slate-500">{comp.category}</div>
                          </div>
                          <input
                            type="number"
                            min={1}
                            value={manualQuantities[comp.id] ?? 1}
                            onChange={(e) => updateManualQuantity(comp.id, Number(e.target.value) || 1)}
                            className="w-20 rounded-xl border border-slate-200 bg-slate-100 px-3 py-2 text-sm text-center"
                          />
                        </div>
                      </div>
                    ))
                )}
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
            <button
              type="button"
              className="btn-secondary"
              onClick={() => setStage("upload")}
            >
              Kembali
            </button>
            <button
              type="button"
              className="btn-primary"
              disabled={manualSelected.length === 0}
              onClick={handleConfirm}
            >
              Tambahkan ke RAB
            </button>
          </div>
        </div>
      )}

      {stage === "done" && (
        <div className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            {/* Image preview with bounding boxes */}
            <div>
              <div className="mb-2 flex items-center gap-2">
                <ScanLine className="h-4 w-4 text-brand-600" />
                <h4 className="text-sm font-semibold text-slate-700">
                  Hasil Deteksi Visual
                </h4>
              </div>
              <div className="relative overflow-hidden rounded-xl border border-slate-200 bg-slate-900" style={{ width: '100%' }}>
                {imagePreview && imagePreview !== "sample" ? (
                  <img
                    src={imagePreview}
                    alt="SLD"
                    className="block w-full"
                    style={{ height: 'auto' }}
                  />
                ) : (
                  <SampleSLD />
                )}
                {detections.map((d, idx) => (
                  <div
                    key={d.id}
                    className="absolute border-2 border-brand-400 bg-brand-400/10"
                    style={{
                      left: `${d.bbox.x}%`,
                      top: `${d.bbox.y}%`,
                      width: `${d.bbox.width}%`,
                      height: `${d.bbox.height}%`,
                    }}
                  >
                    <span className="absolute -top-5 left-0 whitespace-nowrap rounded bg-brand-600 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                      {idx + 1}. {d.label} ({(d.confidence * 100).toFixed(0)}%)
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Detection list */}
            <div>
              <div className="mb-2 flex items-center justify-between">
                <h4 className="text-sm font-semibold text-slate-700">
                  Komponen Terdeteksi ({detections.length})
                </h4>
                <button
                  className="btn-ghost text-xs"
                  onClick={() => setStage("upload")}
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  Deteksi Ulang
                </button>
              </div>
              <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
                {detections.map((d, idx) => {
                  const comp = catalogComponents.find(
                    (c) => c.id === d.matchedComponentId,
                  );
                  return (
                    <div
                      key={d.id}
                      className="rounded-xl border border-slate-200 bg-white p-3 animate-scale-in"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="flex h-6 w-6 items-center justify-center rounded-md bg-brand-100 text-xs font-bold text-brand-700">
                            {idx + 1}
                          </span>
                          <div>
                            <div className="text-sm font-medium text-slate-800">
                              {d.label}
                            </div>
                            <div className="text-xs text-slate-500">
                              OCR: "{d.ocrText}" · Conf:{" "}
                              {(d.confidence * 100).toFixed(0)}%
                            </div>
                          </div>
                        </div>
                        <button
                          onClick={() => removeDetection(d.id)}
                          className="rounded-md p-1 text-slate-300 hover:bg-rose-50 hover:text-rose-600"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                      {comp ? (
                        <div className="mt-2 flex items-center justify-between rounded-lg bg-emerald-50 px-2.5 py-1.5">
                          <span className="text-xs text-emerald-700">
                            Cocok: {comp.name}
                          </span>
                          <span className="text-xs font-semibold text-emerald-700">
                            {formatRupiah(comp.price)}
                          </span>
                        </div>
                      ) : (
                        <select
                          className="mt-2 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs outline-none focus:border-brand-500"
                          value={d.matchedComponentId ?? ""}
                          onChange={(e) =>
                            updateDetection(d.id, {
                              matchedComponentId: e.target.value,
                            })
                          }
                        >
                          <option value="">Pilih komponen...</option>
                          {catalogComponents.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.name} — {formatRupiah(c.price)}
                            </option>
                          ))}
                        </select>
                      )}
                    </div>
                  );
                })}
                {detections.length === 0 && (
                  <div className="py-8 text-center text-sm text-slate-500">
                    Tidak ada deteksi tersisa.
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="space-y-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
            <div className="flex items-center gap-2 text-sm font-medium text-slate-700">
              <MessageSquareWarning className="h-4 w-4" />
              Apakah hasil deteksi sudah sesuai?
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className={`rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                  detectionValid === "yes"
                    ? "bg-emerald-100 text-emerald-700"
                    : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-100"
                }`}
                onClick={() => {
                  setDetectionValid("yes");
                  setReportError("");
                }}
              >
                Ya, sudah sesuai
              </button>
              <button
                type="button"
                className={`rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                  detectionValid === "no"
                    ? "bg-rose-100 text-rose-700"
                    : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-100"
                }`}
                onClick={() => {
                  setDetectionValid("no");
                  setReportSent(false);
                }}
              >
                Tidak sesuai
              </button>
            </div>

            {detectionValid === "no" && (
              <div className="space-y-3 rounded-xl border border-rose-200 bg-rose-50 p-3">
                <label className="text-sm font-medium text-rose-700">
                  Jelaskan keluhan deteksi
                </label>
                <textarea
                  value={reportComplaint}
                  onChange={(e) => setReportComplaint(e.target.value)}
                  rows={4}
                  className="w-full rounded-lg border border-rose-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-rose-300"
                  placeholder="Contoh: simbol MCB di sisi kanan tidak terbaca, label OCR keliru, atau ada komponen yang terlewat."
                />

                {reportError && (
                  <div className="rounded-lg border border-rose-200 bg-white px-3 py-2 text-xs text-rose-700">
                    {reportError}
                  </div>
                )}

                {reportSent ? (
                  <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
                    Report berhasil dikirim ke admin beserta gambar deteksi.
                  </div>
                ) : (
                  <button
                    type="button"
                    className="btn-primary"
                    onClick={() => {
                      void handleSendReport();
                    }}
                    disabled={reportSending}
                  >
                    {reportSending ? (
                      <>
                        <RefreshCw className="h-4 w-4 animate-spin" />
                        Mengirim Report...
                      </>
                    ) : (
                      <>
                        <Send className="h-4 w-4" />
                        Kirim Report ke Admin
                      </>
                    )}
                  </button>
                )}
              </div>
            )}
          </div>

          <div className="flex items-center justify-between rounded-xl bg-brand-50 px-4 py-3">
            <div className="flex items-center gap-2 text-sm text-brand-700">
              <CheckCircle2 className="h-4 w-4" />
              {detectionValid === "no"
                ? "Jika deteksi tidak sesuai, kirim report lalu gunakan input manual atau deteksi ulang."
                : `${detections.filter((d) => d.matchedComponentId).length} komponen siap ditambahkan ke RAB.`}
            </div>
            <div className="flex gap-2">
              <button className="btn-ghost" onClick={() => setStage("upload")}>
                Ganti Gambar
              </button>
              {detectionValid === "no" ? (
                <button className="btn-secondary" onClick={() => setStage("manual")}>
                  Input Manual
                </button>
              ) : (
                <button
                  className="btn-primary"
                  onClick={handleConfirm}
                  disabled={detectionValid !== "yes"}
                >
                  <CheckCircle2 className="h-4 w-4" />
                  Konfirmasi & Tambah
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}

function SampleSLD() {
  return (
    <div className="relative h-full w-full bg-slate-900 p-4">
      <svg
        viewBox="0 0 100 75"
        className="h-full w-full"
        preserveAspectRatio="xMidYMid meet"
      >
        <defs>
          <pattern id="grid" width="5" height="5" patternUnits="userSpaceOnUse">
            <path
              d="M 5 0 L 0 0 0 5"
              fill="none"
              stroke="rgba(255,255,255,0.05)"
              strokeWidth="0.3"
            />
          </pattern>
        </defs>
        <rect width="100" height="75" fill="url(#grid)" />

        <line
          x1="24"
          y1="26"
          x2="40"
          y2="26"
          stroke="#475569"
          strokeWidth="0.8"
        />
        <line
          x1="62"
          y1="29"
          x2="68"
          y2="29"
          stroke="#475569"
          strokeWidth="0.8"
        />
        <line
          x1="35"
          y1="59"
          x2="55"
          y2="57"
          stroke="#475569"
          strokeWidth="0.8"
        />
        <line
          x1="62"
          y1="57"
          x2="75"
          y2="58"
          stroke="#475569"
          strokeWidth="0.8"
        />
        <line
          x1="37"
          y1="80"
          x2="60"
          y2="80"
          stroke="#475569"
          strokeWidth="0.8"
        />

        <rect
          x="15"
          y="20"
          width="18"
          height="12"
          fill="none"
          stroke="#38bdf8"
          strokeWidth="1"
          rx="1"
        />
        <line
          x1="18"
          y1="23"
          x2="18"
          y2="29"
          stroke="#38bdf8"
          strokeWidth="0.8"
        />
        <line
          x1="21"
          y1="23"
          x2="21"
          y2="29"
          stroke="#38bdf8"
          strokeWidth="0.8"
        />
        <line
          x1="24"
          y1="23"
          x2="24"
          y2="29"
          stroke="#38bdf8"
          strokeWidth="0.8"
        />
        <text x="24" y="18" fill="#94a3b8" fontSize="2.5" textAnchor="middle">
          MCB 16A
        </text>

        <rect
          x="40"
          y="18"
          width="22"
          height="16"
          fill="none"
          stroke="#fbbf24"
          strokeWidth="1"
          rx="1"
        />
        <text x="51" y="27" fill="#fbbf24" fontSize="3" textAnchor="middle">
          MCCB
        </text>
        <text x="51" y="31" fill="#94a3b8" fontSize="2" textAnchor="middle">
          100A 3P
        </text>

        <rect
          x="68"
          y="22"
          width="20"
          height="14"
          fill="none"
          stroke="#34d399"
          strokeWidth="1"
          rx="1"
        />
        <text x="78" y="30" fill="#34d399" fontSize="2.5" textAnchor="middle">
          RCCB
        </text>

        <circle
          cx="62"
          cy="57"
          r="7"
          fill="none"
          stroke="#fbbf24"
          strokeWidth="1"
        />
        <line
          x1="58"
          y1="53"
          x2="66"
          y2="61"
          stroke="#fbbf24"
          strokeWidth="0.8"
        />
        <line
          x1="66"
          y1="53"
          x2="58"
          y2="61"
          stroke="#fbbf24"
          strokeWidth="0.8"
        />

        <rect
          x="75"
          y="52"
          width="16"
          height="12"
          fill="none"
          stroke="#38bdf8"
          strokeWidth="1"
          rx="1"
        />
        <circle
          cx="79"
          cy="58"
          r="1.5"
          fill="none"
          stroke="#38bdf8"
          strokeWidth="0.6"
        />
        <circle
          cx="87"
          cy="58"
          r="1.5"
          fill="none"
          stroke="#38bdf8"
          strokeWidth="0.6"
        />

        <rect
          x="30"
          y="75"
          width="14"
          height="10"
          fill="none"
          stroke="#a78bfa"
          strokeWidth="1"
          rx="1"
        />
        <line
          x1="33"
          y1="78"
          x2="41"
          y2="82"
          stroke="#a78bfa"
          strokeWidth="0.8"
        />

        <rect
          x="60"
          y="72"
          width="24"
          height="18"
          fill="none"
          stroke="#f87171"
          strokeWidth="1"
          rx="1"
        />
        <text x="72" y="82" fill="#f87171" fontSize="2.5" textAnchor="middle">
          PANEL
        </text>
      </svg>
    </div>
  );
}
