import { AlertTriangle, Camera, Upload } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { drawDetections, loadDetector, type DetectedObject } from "@/lib/detection";

type Mode = "schematic" | "local";

type ScanRow = {
  frame: number;
  timestamp: number;
  objects: number;
  classes: string;
  confidenceRange: string;
};

function SchematicView() {
  return (
    <div className="relative aspect-video w-full overflow-hidden rounded-md bg-surface">
      {/* Decorative junction schematic — carries no traffic data. */}
      <div className="absolute inset-x-0 top-1/2 h-14 -translate-y-1/2 bg-muted-foreground/25" />
      <div className="absolute inset-y-0 left-1/2 w-14 -translate-x-1/2 bg-muted-foreground/25" />
      {[
        "left-[6%] top-[calc(50%-26px)] animate-pulse",
        "right-[6%] top-[calc(50%+6px)] animate-pulse [animation-delay:400ms]",
        "left-[calc(50%-26px)] top-[8%] animate-pulse [animation-delay:800ms]",
        "left-[calc(50%+6px)] bottom-[8%] animate-pulse [animation-delay:1200ms]",
      ].map((position) => (
        <span
          key={position}
          className={`absolute h-5 w-8 rounded-sm bg-signal-amber/80 ${position}`}
          aria-hidden
        />
      ))}
      <p className="absolute bottom-2 left-2 text-[11px] text-surface-foreground/70">
        SCHEMATIC VIEW — No Real Camera Feed
      </p>
    </div>
  );
}

export function CameraFeed() {
  const [mode, setMode] = useState<Mode>("schematic");
  const [modelError, setModelError] = useState<string | null>(null);
  const [modelReady, setModelReady] = useState(false);
  const [sourceLabel, setSourceLabel] = useState<string | null>(null);
  const [liveDetections, setLiveDetections] = useState<DetectedObject[]>([]);
  const [scanning, setScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState(0);
  const [scanRows, setScanRows] = useState<ScanRow[]>([]);
  const [isFile, setIsFile] = useState(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const overlayRef = useRef<HTMLCanvasElement | null>(null);
  const workRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const objectUrlRef = useRef<string | null>(null);

  const stopLive = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    objectUrlRef.current = null;
  }, []);

  useEffect(() => stopLive, [stopLive]);

  const ensureModel = useCallback(async () => {
    try {
      const detector = await loadDetector();
      setModelReady(true);
      setModelError(null);
      return detector;
    } catch {
      setModelReady(false);
      setModelError(
        "Real vehicle detection is unavailable in this browser (it needs TensorFlow.js). Plate reading on the ANPR page still works.",
      );
      return null;
    }
  }, []);

  const runLiveLoop = useCallback(async () => {
    const detector = await ensureModel();
    if (!detector) return;

    const tick = async () => {
      const video = videoRef.current;
      const overlay = overlayRef.current;
      if (!video || !overlay || video.readyState < 2) {
        rafRef.current = requestAnimationFrame(() => void tick());
        return;
      }
      overlay.width = video.videoWidth || overlay.clientWidth;
      overlay.height = video.videoHeight || overlay.clientHeight;
      const ctx = overlay.getContext("2d");
      if (ctx) {
        try {
          const found = await detector.detect(video);
          setLiveDetections(found);
          ctx.clearRect(0, 0, overlay.width, overlay.height);
          drawDetections(ctx, found);
        } catch {
          /* skip this frame */
        }
      }
      rafRef.current = requestAnimationFrame(() => void tick());
    };
    void tick();
  }, [ensureModel]);

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    stopLive();
    setScanRows([]);
    setIsFile(true);
    const url = URL.createObjectURL(file);
    objectUrlRef.current = url;
    setSourceLabel(`Local file: ${file.name}`);
    const video = videoRef.current;
    if (video) {
      video.srcObject = null;
      video.src = url;
      video.loop = true;
      await video.play().catch(() => undefined);
    }
    void runLiveLoop();
  };

  const startWebcam = async () => {
    stopLive();
    setScanRows([]);
    setIsFile(false);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      streamRef.current = stream;
      const video = videoRef.current;
      if (video) {
        video.src = "";
        video.srcObject = stream;
        await video.play().catch(() => undefined);
      }
      setSourceLabel("Webcam");
      void runLiveLoop();
    } catch {
      setSourceLabel(null);
      setModelError("The browser would not give access to a camera on this device.");
    }
  };

  /** Steps the uploaded file at 0.5s intervals and detects on each real frame. */
  const scanEntireVideo = async () => {
    const video = videoRef.current;
    const work = workRef.current;
    if (!video || !work || !Number.isFinite(video.duration)) return;
    const detector = await ensureModel();
    if (!detector) return;

    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    video.pause();

    setScanning(true);
    setScanRows([]);
    setScanProgress(0);

    const ctx = work.getContext("2d");
    const step = 0.5;
    const rows: ScanRow[] = [];

    for (let t = 0, index = 1; t < video.duration; t += step, index += 1) {
      const seeked = new Promise<void>((resolve) => {
        const onSeeked = () => {
          video.removeEventListener("seeked", onSeeked);
          resolve();
        };
        video.addEventListener("seeked", onSeeked);
      });
      video.currentTime = t;
      await seeked;

      work.width = video.videoWidth;
      work.height = video.videoHeight;
      ctx?.drawImage(video, 0, 0, work.width, work.height);
      let found: DetectedObject[] = [];
      try {
        found = await detector.detect(work);
      } catch {
        found = [];
      }
      const scores = found.map((d) => d.score * 100);
      rows.push({
        frame: index,
        timestamp: Number(t.toFixed(1)),
        objects: found.length,
        classes: found.length ? [...new Set(found.map((d) => d.class))].join(", ") : "none",
        confidenceRange: scores.length
          ? `${Math.min(...scores).toFixed(1)}% – ${Math.max(...scores).toFixed(1)}%`
          : "—",
      });
      setScanRows([...rows]);
      setScanProgress(Math.min(100, Math.round(((t + step) / video.duration) * 100)));
    }

    setScanning(false);
    void video.play().catch(() => undefined);
    void runLiveLoop();
  };

  return (
    <section className="panel" aria-label="Junction camera feed">
      <h3 className="panel-header">
        Junction Camera
        <span className="flex gap-1">
          {(
            [
              ["schematic", "Schematic"],
              ["local", "File / Webcam"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => {
                if (value === "schematic") stopLive();
                setMode(value);
              }}
              aria-pressed={mode === value}
              className={`rounded-sm px-2 py-1 text-[10px] font-bold uppercase tracking-[0.1em] ${
                mode === value
                  ? "bg-primary text-primary-foreground"
                  : "bg-card text-muted-foreground hover:text-foreground"
              }`}
            >
              {label}
            </button>
          ))}
        </span>
      </h3>

      <div className="space-y-3 p-4">
        {mode === "schematic" ? (
          <SchematicView />
        ) : (
          <>
            <div className="flex flex-wrap gap-2">
              <label className="inline-flex">
                <input
                  type="file"
                  accept="video/*"
                  className="sr-only"
                  onChange={(e) => void handleFile(e.target.files?.[0])}
                />
                <span className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-md border border-input bg-card px-3 text-sm font-medium hover:bg-accent">
                  <Upload className="size-4" aria-hidden /> Upload video
                </span>
              </label>
              <Button variant="secondary" size="sm" onClick={() => void startWebcam()}>
                <Camera className="size-4" aria-hidden /> Use webcam
              </Button>
              {isFile ? (
                <Button size="sm" onClick={() => void scanEntireVideo()} disabled={scanning}>
                  {scanning ? `Scanning… ${scanProgress}%` : "Scan entire video"}
                </Button>
              ) : null}
            </div>

            <div className="relative aspect-video w-full overflow-hidden rounded-md bg-surface">
              <video
                ref={videoRef}
                muted
                playsInline
                className="size-full object-contain"
                aria-label="Camera or uploaded video source"
              />
              <canvas
                ref={overlayRef}
                className="pointer-events-none absolute inset-0 size-full object-contain"
              />
              {!sourceLabel ? (
                <p className="absolute inset-0 flex items-center justify-center px-6 text-center text-sm text-surface-foreground/70">
                  Choose a video file or start the webcam to run on-device vehicle detection.
                </p>
              ) : null}
              <p className="absolute bottom-2 left-2 text-[11px] text-surface-foreground/70">
                {sourceLabel ?? "No source selected"}
                {modelReady ? " · coco-ssd detection active" : ""}
              </p>
            </div>
            <canvas ref={workRef} className="hidden" />

            {modelError ? (
              <p
                role="alert"
                className="flex items-start gap-2 rounded-md border border-warn/40 bg-warn/10 px-3 py-2 text-sm text-warn"
              >
                <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
                {modelError}
              </p>
            ) : null}

            {liveDetections.length ? (
              <ul className="flex flex-wrap gap-1.5">
                {liveDetections.map((d, i) => (
                  <li
                    key={`${d.class}-${i}`}
                    className="data-value rounded-sm border border-border bg-secondary px-2 py-0.5 text-[11px]"
                  >
                    {d.class} {(d.score * 100).toFixed(1)}%
                  </li>
                ))}
              </ul>
            ) : null}

            {scanRows.length ? (
              <div className="max-h-64 overflow-auto rounded-md border border-border">
                <table className="w-full text-left text-xs">
                  <caption className="sr-only">Frame-by-frame detection results</caption>
                  <thead className="sticky top-0 bg-secondary">
                    <tr>
                      {["Frame", "Timestamp", "Objects", "Classes", "Confidence range"].map((h) => (
                        <th
                          key={h}
                          scope="col"
                          className="px-2 py-1.5 font-display text-[10px] uppercase tracking-[0.1em]"
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {scanRows.map((row) => (
                      <tr key={row.frame} className="border-t border-border">
                        <td className="data-value px-2 py-1">{row.frame}</td>
                        <td className="data-value px-2 py-1">{row.timestamp.toFixed(1)}s</td>
                        <td className="data-value px-2 py-1">{row.objects}</td>
                        <td className="px-2 py-1">{row.classes}</td>
                        <td className="data-value px-2 py-1">{row.confidenceRange}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
          </>
        )}
      </div>
    </section>
  );
}
