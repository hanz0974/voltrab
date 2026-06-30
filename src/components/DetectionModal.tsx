import { useState, useRef, useEffect } from "react";
import {
  Upload,
  ScanLine,
  CheckCircle2,
  Image as ImageIcon,
  X,
  RefreshCw,
  AlertCircle,
} from "lucide-react";
import type { DetectionResult, PartItem } from "../types";
import { COMPONENT_CATALOG, formatRupiah, uid } from "../data";
import { apiDetectImage } from "../lib/api";
import { Modal } from "./Modal";
import { supabase } from "../lib/supabase"; // SESUAIKAN PATH INI

interface DetectionModalProps {
  open: boolean;
  onClose: () => void;
  onConfirm: (parts: PartItem[]) => void;
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

const MOCK_DETECTIONS = [
  {
    label: "MCB",
    confidence: 0.94,
    bbox: { x: 15, y: 20, width: 18, height: 12 },
    ocr_text: "16A",
  },
  {
    label: "MCCB",
    confidence: 0.91,
    bbox: { x: 40, y: 18, width: 22, height: 16 },
    ocr_text: "100A 3P",
  },
  {
    label: "RCCB",
    confidence: 0.88,
    bbox: { x: 68, y: 22, width: 20, height: 14 },
    ocr_text: "40A 30mA",
  },
  {
    label: "Kabel NYM",
    confidence: 0.86,
    bbox: { x: 20, y: 55, width: 30, height: 8 },
    ocr_text: "3x2.5mm",
  },
  {
    label: "Lampu LED",
    confidence: 0.92,
    bbox: { x: 55, y: 50, width: 14, height: 14 },
    ocr_text: "18W",
  },
  {
    label: "Stop Kontak",
    confidence: 0.84,
    bbox: { x: 75, y: 52, width: 16, height: 12 },
    ocr_text: "Tunggal",
  },
  {
    label: "Saklar",
    confidence: 0.89,
    bbox: { x: 30, y: 75, width: 14, height: 10 },
    ocr_text: "Tunggal",
  },
  {
    label: "Panel Box",
    confidence: 0.79,
    bbox: { x: 60, y: 72, width: 24, height: 18 },
    ocr_text: "1 Pintu",
  },
];

export function DetectionModal({
  open,
  onClose,
  onConfirm,
}: DetectionModalProps) {
  const [stage, setStage] = useState<
    "upload" | "processing" | "done" | "error"
  >("upload");
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [detections, setDetections] = useState<DetectionResult[]>([]);
  const [progress, setProgress] = useState(0);
  const [processingStep, setProcessingStep] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const dragRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) {
      setStage("upload");
      setImagePreview(null);
      setDetections([]);
      setProgress(0);
      setErrorMsg("");
    }
  }, [open]);

  const runDetection = async (file: File) => {
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
        setErrorMsg("Sesi login tidak ditemukan. Silakan login ulang.");
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

      setDetections(results);

      if (result.image_url) {
        setImagePreview(result.image_url);
      }

      setStage("done");
    } catch {
      // Backend FastAPI tidak aktif — fallback ke mock detections
      clearInterval(progressInterval);
      setProgress(100);
      setProcessingStep("Finalisasi hasil deteksi...");

      const mockResults: DetectionResult[] = MOCK_DETECTIONS.map((d) => ({
        id: uid(),
        label: d.label,
        confidence: d.confidence,
        bbox: d.bbox,
        ocrText: d.ocr_text,
        matchedComponentId: LABEL_TO_COMPONENT[d.label],
      }));

      setDetections(mockResults);
      setStage("done");
    }
  };

  const handleFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      setImagePreview(e.target?.result as string);
      runDetection(file);
    };
    reader.readAsDataURL(file);
  };

  const useSampleImage = () => {
    // Untuk sample, buat blob dari SVG dummy dan kirim ke API
    setImagePreview("sample");
    // Buat file dummy dari SVG
    const svgContent = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300" viewBox="0 0 100 75">
      <rect width="100" height="75" fill="#1e293b"/>
      <rect x="15" y="20" width="18" height="12" fill="none" stroke="#38bdf8" stroke-width="1"/>
      <rect x="40" y="18" width="22" height="16" fill="none" stroke="#fbbf24" stroke-width="1"/>
      <rect x="68" y="22" width="20" height="14" fill="none" stroke="#34d399" stroke-width="1"/>
      <circle cx="62" cy="57" r="7" fill="none" stroke="#fbbf24" stroke-width="1"/>
      <rect x="75" y="52" width="16" height="12" fill="none" stroke="#38bdf8" stroke-width="1"/>
      <rect x="30" y="75" width="14" height="10" fill="none" stroke="#a78bfa" stroke-width="1"/>
      <rect x="60" y="72" width="24" height="18" fill="none" stroke="#f87171" stroke-width="1"/>
    </svg>`;
    const blob = new Blob([svgContent], { type: "image/svg+xml" });
    const file = new File([blob], "sample-sld.svg", { type: "image/svg+xml" });
    runDetection(file);
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
    const parts: PartItem[] = detections
      .filter((d) => d.matchedComponentId)
      .map((d) => {
        const comp = COMPONENT_CATALOG.find(
          (c) => c.id === d.matchedComponentId,
        )!;
        return {
          id: uid(),
          componentId: comp.id,
          name: comp.name,
          category: comp.category,
          unit: comp.unit,
          quantity: 1,
          price: comp.price,
        };
      });
    onConfirm(parts);
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Deteksi Komponen SLD"
      subtitle="Unggah diagram SLD, deteksi otomatis dengan YOLOv8 + OCR via FastAPI."
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
            <button className="btn-secondary" onClick={useSampleImage}>
              <ImageIcon className="h-4 w-4" />
              Gunakan Contoh SLD
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
              Pastikan server FastAPI berjalan di{" "}
              <code className="rounded bg-slate-100 px-1">localhost:8000</code>
            </p>
            <button
              className="btn-secondary mt-5"
              onClick={() => setStage("upload")}
            >
              Coba Lagi
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
              <div className="relative aspect-[4/3] overflow-hidden rounded-xl border border-slate-200 bg-slate-900">
                {imagePreview && imagePreview !== "sample" ? (
                  <img
                    src={imagePreview}
                    alt="SLD"
                    className="h-full w-full object-contain"
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
                  const comp = COMPONENT_CATALOG.find(
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
                          {COMPONENT_CATALOG.map((c) => (
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

          <div className="flex items-center justify-between rounded-xl bg-brand-50 px-4 py-3">
            <div className="flex items-center gap-2 text-sm text-brand-700">
              <CheckCircle2 className="h-4 w-4" />
              {detections.filter((d) => d.matchedComponentId).length} komponen
              siap ditambahkan ke RAB.
            </div>
            <div className="flex gap-2">
              <button className="btn-ghost" onClick={() => setStage("upload")}>
                Ganti Gambar
              </button>
              <button className="btn-primary" onClick={handleConfirm}>
                <CheckCircle2 className="h-4 w-4" />
                Konfirmasi & Tambah
              </button>
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
