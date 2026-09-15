import { createFileRoute } from "@tanstack/react-router";
import { AlertTriangle, Check, Upload } from "lucide-react";
import { useRef, useState } from "react";

import { ApiError, apiRequest } from "@/lib/api";
import { drawDetections, estimateBoxColor, loadDetector, type DetectedObject } from "@/lib/detection";
import { AppShell, RequireAuth } from "@/components/AppShell";
import { VehicleRecord, recordText, type LookupResult } from "@/components/VehicleRecord";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";

export const Route = createFileRoute("/dashboard")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "ANPR Dashboard — Plate Recognition & Registry Check | VIMS" },
      {
        name: "description",
        content:
          "Run the VIMS plate recognition pipeline: frame extraction, vehicle detection, OCR, registry lookup and attribute comparison.",
      },
      { property: "og:title", content: "ANPR Dashboard — Plate Recognition & Registry Check | VIMS" },
      {
        property: "og:description",
        content:
          "Upload an image or video, read the plate, and compare detected vehicle attributes against the registry record.",
      },
    ],
  }),
  component: () => (
    <RequireAuth>
      <AnprDashboard />
    </RequireAuth>
  ),
});

const IMAGE_TYPES = [".jpg", ".jpeg", ".png", ".webp", ".bmp"];
const VIDEO_TYPES = [".mp4", ".webm", ".avi", ".mkv"];
const MAX_BYTES = 200 * 1024 * 1024;

type Frame = {
  index: number;
  timestamp: number | null;
  dataUrl: string;
  width: number;
  height: number;
};

type FrameDetection = {
  frameIndex: number;
  detections: DetectedObject[];
  annotated: string | null;
  topClass: string | null;
  topScore: number | null;
  color: string | null;
};

type OcrResult = {
  plate: string | null;
  confidence: number | null;
  candidates: Array<{ plate?: string; confidence?: number }>;
};

type StageState = "idle" | "running" | "done" | "error";

const STAGE_TITLES = [
  "Upload",
  "Frame extraction",
  "Vehicle detection",
  "Plate reading (OCR)",
  "Registry lookup",
  "Comparison & verdict",
];

function StageCard({
  index,
  state,
  error,
  onRetry,
  children,
}: {
  index: number;
  state: StageState;
  error?: string | null;
  onRetry?: () => void;
  children?: React.ReactNode;
}) {
  if (state === "idle") return null;
  return (
    <section className="panel">
      <h3 className="panel-header">
        <span>
          Stage {index} — {STAGE_TITLES[index]}
        </span>
        {state === "running" ? (
          <span className="animate-pulse font-sans text-[10px] normal-case tracking-normal text-muted-foreground">
            Working…
          </span>
        ) : null}
        {state === "done" ? <Check className="size-4 text-ok" aria-label="Complete" /> : null}
      </h3>
      <div className="space-y-3 p-4">
        {error ? (
          <div
            role="alert"
            className="flex flex-wrap items-center gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            <AlertTriangle className="size-4 shrink-0" aria-hidden />
            <span className="flex-1">{error}</span>
            {onRetry ? (
              <Button size="sm" variant="secondary" onClick={onRetry}>
                Retry
              </Button>
            ) : null}
          </div>
        ) : null}
        {children}
      </div>
    </section>
  );
}

function Confidence({ value }: { value: number | null }) {
  if (value === null) return <span className="text-sm text-muted-foreground">Not reported</span>;
  return (
    <span className="space-x-2">
      <span className="data-value text-sm">{value}%</span>
      {value < 60 ? (
        <span className="text-xs font-semibold text-warn">
          ⚠ Low confidence — recommend manual review
        </span>
      ) : null}
    </span>
  );
}

function AnprDashboard() {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);

  const [stage, setStage] = useState(0);
  const [frames, setFrames] = useState<Frame[]>([]);
  const [samplingNote, setSamplingNote] = useState<string | null>(null);
  const [detections, setDetections] = useState<FrameDetection[]>([]);
  const [detectionNote, setDetectionNote] = useState<string | null>(null);
  const [ocr, setOcr] = useState<OcrResult | null>(null);
  const [lookup, setLookup] = useState<LookupResult | null>(null);

  const [states, setStates] = useState<StageState[]>(["idle", "idle", "idle", "idle", "idle", "idle"]);
  const [errors, setErrors] = useState<Array<string | null>>([null, null, null, null, null, null]);
  const objectUrlRef = useRef<string | null>(null);

  const setStageState = (i: number, value: StageState, error: string | null = null) => {
    setStates((prev) => prev.map((s, idx) => (idx === i ? value : s)));
    setErrors((prev) => prev.map((e, idx) => (idx === i ? error : e)));
  };

  const chooseFile = (next: File | undefined) => {
    if (!next) return;
    const name = next.name.toLowerCase();
    const allowed = [...IMAGE_TYPES, ...VIDEO_TYPES];
    if (!allowed.some((ext) => name.endsWith(ext))) {
      setFileError(`Use one of: ${allowed.join(", ")}`);
      return;
    }
    if (next.size > MAX_BYTES) {
      setFileError("That file is larger than 200 MB. Please pick a smaller one.");
      return;
    }
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    const url = URL.createObjectURL(next);
    objectUrlRef.current = url;
    setFileError(null);
    setFile(next);
    setPreview(url);
    setStage(0);
    setFrames([]);
    setDetections([]);
    setOcr(null);
    setLookup(null);
    setStates(["idle", "idle", "idle", "idle", "idle", "idle"]);
    setErrors([null, null, null, null, null, null]);
  };

  const isVideo = file ? VIDEO_TYPES.some((ext) => file.name.toLowerCase().endsWith(ext)) : false;

  /** Stage 1: real canvas grabs from the decoded file. */
  const extractFrames = async (): Promise<Frame[]> => {
    if (!file || !preview) throw new Error("No file selected.");
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("This browser could not decode the file.");

    if (!isVideo) {
      const img = new Image();
      img.src = preview;
      await img.decode();
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      ctx.drawImage(img, 0, 0);
      setSamplingNote("Single frame taken from the uploaded image.");
      return [
        {
          index: 1,
          timestamp: null,
          dataUrl: canvas.toDataURL("image/jpeg", 0.85),
          width: canvas.width,
          height: canvas.height,
        },
      ];
    }

    const video = document.createElement("video");
    video.src = preview;
    video.muted = true;
    await new Promise<void>((resolve, reject) => {
      video.onloadedmetadata = () => resolve();
      video.onerror = () => reject(new Error("This video could not be decoded in the browser."));
    });

    const duration = Number.isFinite(video.duration) ? video.duration : 0;
    const step = 0.5;
    const maxFrames = 5;
    const spacing = duration > maxFrames * step ? duration / maxFrames : step;
    const out: Frame[] = [];

    for (let i = 0; i < maxFrames; i += 1) {
      const t = Math.min(duration - 0.05, i * spacing);
      if (t < 0) break;
      await new Promise<void>((resolve) => {
        const onSeeked = () => {
          video.removeEventListener("seeked", onSeeked);
          resolve();
        };
        video.addEventListener("seeked", onSeeked);
        video.currentTime = t;
      });
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      ctx.drawImage(video, 0, 0);
      out.push({
        index: i + 1,
        timestamp: Number(t.toFixed(2)),
        dataUrl: canvas.toDataURL("image/jpeg", 0.85),
        width: canvas.width,
        height: canvas.height,
      });
    }
    setSamplingNote(
      `Extracted ${out.length} frame${out.length === 1 ? "" : "s"} from a ${duration.toFixed(1)}s video at ${spacing.toFixed(1)}s intervals.`,
    );
    return out;
  };

  /** Stage 2: real coco-ssd detection on each extracted frame. */
  const detectFrames = async (input: Frame[]): Promise<FrameDetection[]> => {
    const detector = await loadDetector().catch(() => null);
    if (!detector) {
      setDetectionNote(
        "Real vehicle detection is unavailable in this browser (it needs TensorFlow.js). Plate reading below still works.",
      );
      return [];
    }
    setDetectionNote(null);
    const out: FrameDetection[] = [];
    for (const frame of input) {
      const img = new Image();
      img.src = frame.dataUrl;
      await img.decode();
      const canvas = document.createElement("canvas");
      canvas.width = frame.width;
      canvas.height = frame.height;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) continue;
      ctx.drawImage(img, 0, 0);
      const found = await detector.detect(canvas);
      const best = found.reduce<DetectedObject | null>(
        (acc, d) => (!acc || d.score > acc.score ? d : acc),
        null,
      );
      const color = best ? estimateBoxColor(canvas, best.bbox) : null;
      drawDetections(ctx, found);
      out.push({
        frameIndex: frame.index,
        detections: found,
        annotated: canvas.toDataURL("image/jpeg", 0.85),
        topClass: best?.class ?? null,
        topScore: best ? Number((best.score * 100).toFixed(1)) : null,
        color,
      });
    }
    return out;
  };

  const runOcr = async (): Promise<OcrResult> => {
    if (!file) throw new Error("No file selected.");
    const form = new FormData();
    form.append("file", file);
    if (isVideo) {
      const res = await apiRequest<{
        plates?: Array<{ plate?: string; best_confidence?: number }>;
      }>("/api/anpr/scan-video", { method: "POST", body: form });
      const best = res.plates?.[0];
      return {
        plate: best?.plate ?? null,
        confidence: typeof best?.best_confidence === "number" ? best.best_confidence : null,
        candidates: (res.plates ?? []).map((p) => ({
          ...(p.plate !== undefined ? { plate: p.plate } : {}),
          ...(p.best_confidence !== undefined ? { confidence: p.best_confidence } : {}),
        })),
      };
    }
    const res = await apiRequest<{
      plate?: string;
      ocr_confidence?: number;
      all_candidates?: Array<{ plate?: string; confidence?: number }>;
    }>("/api/anpr/recognize", { method: "POST", body: form });
    return {
      plate: res.plate ?? null,
      confidence: typeof res.ocr_confidence === "number" ? res.ocr_confidence : null,
      candidates: res.all_candidates ?? [],
    };
  };

  const runPipeline = async () => {
    // Stage 1
    setStage(1);
    setStageState(1, "running");
    let extracted: Frame[] = [];
    try {
      extracted = await extractFrames();
      setFrames(extracted);
      setStageState(1, "done");
    } catch (err) {
      setStageState(1, "error", err instanceof Error ? err.message : "Frame extraction failed.");
      return;
    }

    // Stage 2
    setStage(2);
    setStageState(2, "running");
    try {
      setDetections(await detectFrames(extracted));
      setStageState(2, "done");
    } catch {
      setStageState(2, "error", "Vehicle detection failed on this file.");
    }

    // Stage 3
    setStage(3);
    setStageState(3, "running");
    let ocrResult: OcrResult | null = null;
    try {
      ocrResult = await runOcr();
      setOcr(ocrResult);
      setStageState(3, "done");
    } catch (err) {
      setStageState(
        3,
        "error",
        err instanceof ApiError ? err.message : "The plate could not be read.",
      );
    }

    // Stage 4
    if (ocrResult?.plate) {
      setStage(4);
      setStageState(4, "running");
      try {
        setLookup(
          await apiRequest<LookupResult>("/api/vehicle/lookup", {
            method: "POST",
            body: { plate: ocrResult.plate },
          }),
        );
        setStageState(4, "done");
      } catch (err) {
        setStageState(
          4,
          "error",
          err instanceof ApiError ? err.message : "The registry lookup failed.",
        );
      }
    }

    setStage(5);
    setStageState(5, "done");
  };

  const detectedColor = detections.find((d) => d.color)?.color ?? null;
  const detectedClass = detections.find((d) => d.topClass)?.topClass ?? null;
  const registryColor = recordText(lookup?.vehicle, "color", "colour");

  return (
    <AppShell>
      <h1 className="mb-1 mt-3 text-xl font-bold text-primary">ANPR Dashboard</h1>
      <p className="mb-4 text-sm text-muted-foreground">
        Plate recognition and registry verification. Every figure below is exactly what the model or
        the registry returned.
      </p>

      <div className="space-y-4">
        <section className="panel">
          <h3 className="panel-header">Stage 0 — Upload</h3>
          <div className="space-y-3 p-4">
            <label className="inline-flex">
              <input
                type="file"
                accept={[...IMAGE_TYPES, ...VIDEO_TYPES].join(",")}
                className="sr-only"
                onChange={(e) => chooseFile(e.target.files?.[0])}
              />
              <span className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-md border border-input bg-card px-3 text-sm font-medium hover:bg-accent">
                <Upload className="size-4" aria-hidden /> Choose image or video
              </span>
            </label>
            <p className="text-xs text-muted-foreground">
              Images: {IMAGE_TYPES.join(", ")} · Video: {VIDEO_TYPES.join(", ")} · up to 200 MB
            </p>
            {fileError ? (
              <p role="alert" className="text-sm text-destructive">
                {fileError}
              </p>
            ) : null}
            {preview && file ? (
              <div className="flex flex-wrap items-center gap-3">
                {isVideo ? (
                  <video
                    src={preview}
                    className="h-28 rounded-md border border-border"
                    muted
                    controls
                  />
                ) : (
                  <img
                    src={preview}
                    alt={`Preview of uploaded file ${file.name}`}
                    className="h-28 rounded-md border border-border object-contain"
                  />
                )}
                <span className="data-value text-xs">{file.name}</span>
              </div>
            ) : null}
            <Button disabled={!file} onClick={() => void runPipeline()}>
              Proceed to analysis
            </Button>
          </div>
        </section>

        {stage > 0 ? (
          <div>
            <div className="mb-1 flex justify-between text-xs text-muted-foreground">
              <span>
                Stage {stage} of 5 — {STAGE_TITLES[stage]}
              </span>
              <span className="data-value">{Math.round((stage / 5) * 100)}%</span>
            </div>
            <Progress value={(stage / 5) * 100} aria-label="Pipeline progress" />
          </div>
        ) : null}

        <StageCard
          index={1}
          state={states[1] ?? "idle"}
          error={errors[1] ?? null}
          onRetry={() => void runPipeline()}
        >
          {samplingNote ? <p className="text-sm text-muted-foreground">{samplingNote}</p> : null}
          <div className="flex flex-wrap gap-2">
            {frames.map((frame) => (
              <figure key={frame.index} className="w-32">
                <img
                  src={frame.dataUrl}
                  alt={`Extracted frame ${frame.index}`}
                  className="h-20 w-full rounded-sm border border-border object-cover"
                />
                <figcaption className="data-value text-[10px]">
                  #{frame.index}
                  {frame.timestamp !== null ? ` · ${frame.timestamp}s` : ""}
                </figcaption>
              </figure>
            ))}
          </div>
        </StageCard>

        <StageCard index={2} state={states[2] ?? "idle"} error={errors[2] ?? null}>
          {detectionNote ? <p className="text-sm text-warn">{detectionNote}</p> : null}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {detections.map((item) => (
              <div key={item.frameIndex} className="rounded-md border border-border p-2">
                {item.annotated ? (
                  <img
                    src={item.annotated}
                    alt={`Frame ${item.frameIndex} with detection boxes drawn`}
                    className="w-full rounded-sm"
                  />
                ) : null}
                {item.detections.length ? (
                  <>
                    <p className="data-value mt-1 text-xs">
                      {item.topClass} · {item.topScore}%
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      Estimated colour from detection:{" "}
                      <span className="data-value">{item.color ?? "unclear"}</span> (low confidence
                      heuristic)
                    </p>
                  </>
                ) : (
                  <p className="mt-1 text-xs text-muted-foreground">
                    No vehicle detected in this frame — skipping
                  </p>
                )}
              </div>
            ))}
          </div>
        </StageCard>

        <StageCard index={3} state={states[3] ?? "idle"} error={errors[3] ?? null}>
          {ocr?.plate ? (
            <>
              <p className="data-value text-2xl font-bold tracking-[0.15em]">{ocr.plate}</p>
              <p>
                <span className="label-caps inline">OCR confidence</span>{" "}
                <Confidence value={ocr.confidence} />
              </p>
              {ocr.candidates.length > 1 ? (
                <ul className="flex flex-wrap gap-1.5">
                  {ocr.candidates.slice(1).map((candidate, i) => (
                    <li
                      key={i}
                      className="data-value rounded-sm border border-border bg-secondary px-2 py-0.5 text-[11px]"
                    >
                      {candidate.plate ?? "?"}{" "}
                      {typeof candidate.confidence === "number" ? `${candidate.confidence}%` : ""}
                    </li>
                  ))}
                </ul>
              ) : null}
            </>
          ) : states[3] === "done" ? (
            <p className="text-sm text-muted-foreground">No readable plate found.</p>
          ) : null}
        </StageCard>

        <StageCard index={4} state={states[4] ?? "idle"} error={errors[4] ?? null}>
          {lookup ? (
            <VehicleRecord result={lookup} />
          ) : (
            <p className="text-sm text-muted-foreground">
              No registry record — a plate has to be read first.
            </p>
          )}
        </StageCard>

        <StageCard index={5} state={states[5] ?? "idle"}>
          {detectedClass || lookup ? (
            <>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-md border border-border p-3">
                  <span className="label-caps">Detected in image</span>
                  <p className="data-value text-sm">Class: {detectedClass ?? "none detected"}</p>
                  <p className="data-value text-sm">Colour: {detectedColor ?? "not estimated"}</p>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    Colour is a coarse heuristic, not a model classification.
                  </p>
                </div>
                <div className="rounded-md border border-border p-3">
                  <span className="label-caps">Registry record</span>
                  <p className="data-value text-sm">
                    Make / model: {recordText(lookup?.vehicle, "make_model", "model") ?? "—"}
                  </p>
                  <p className="data-value text-sm">Colour: {registryColor ?? "—"}</p>
                </div>
              </div>

              {detectedColor && registryColor ? (
                detectedColor.toLowerCase() === registryColor.toLowerCase() ? (
                  <p className="rounded-md border border-ok/40 bg-ok/10 px-3 py-2 text-sm text-ok">
                    Detected colour: {detectedColor} | Registry colour: {registryColor} — MATCH
                    (low-confidence heuristic).
                  </p>
                ) : (
                  <p className="rounded-md border border-warn/40 bg-warn/10 px-3 py-2 text-sm text-warn">
                    Detected colour: {detectedColor} | Registry colour: {registryColor} — MISMATCH
                    (low-confidence heuristic; recommend human review).
                  </p>
                )
              ) : (
                <p className="text-sm text-muted-foreground">
                  A colour comparison is not possible:{" "}
                  {!detectedColor
                    ? "no vehicle colour could be estimated from the image."
                    : "the registry record does not list a colour."}
                </p>
              )}

              <div className="rounded-md border border-border p-3 text-sm text-muted-foreground">
                <p className="font-semibold text-foreground">Suggested next steps</p>
                <p>Contact the vehicle owner for clarification.</p>
                <p>Escalate to manual review if the mismatch persists.</p>
              </div>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              Nothing to compare: no vehicle was detected and no registry record was returned.
            </p>
          )}
        </StageCard>
      </div>
    </AppShell>
  );
}
