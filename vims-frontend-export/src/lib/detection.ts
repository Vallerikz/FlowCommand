import type { DetectedObject, ObjectDetection } from "@tensorflow-models/coco-ssd";

export type { DetectedObject };

let modelPromise: Promise<ObjectDetection> | null = null;

/** COCO classes that matter for traffic work. */
export const TRAFFIC_CLASSES = new Set([
  "car",
  "bus",
  "truck",
  "motorcycle",
  "bicycle",
  "person",
  "train",
]);

/**
 * Loads TensorFlow.js + coco-ssd on demand. Throws if the browser or network
 * cannot provide it, so callers can degrade gracefully.
 */
export async function loadDetector(): Promise<ObjectDetection> {
  if (!modelPromise) {
    modelPromise = (async () => {
      await import("@tensorflow/tfjs");
      const cocoSsd = await import("@tensorflow-models/coco-ssd");
      return cocoSsd.load({ base: "lite_mobilenet_v2" });
    })();
    modelPromise.catch(() => {
      modelPromise = null;
    });
  }
  return modelPromise;
}

const COLOR_REFERENCE: Array<{ name: string; rgb: [number, number, number] }> = [
  { name: "Black", rgb: [25, 25, 25] },
  { name: "Grey", rgb: [128, 128, 128] },
  { name: "Silver", rgb: [190, 190, 195] },
  { name: "White", rgb: [240, 240, 240] },
  { name: "Red", rgb: [190, 40, 40] },
  { name: "Orange", rgb: [225, 130, 30] },
  { name: "Yellow", rgb: [225, 205, 50] },
  { name: "Green", rgb: [45, 140, 70] },
  { name: "Blue", rgb: [45, 80, 180] },
  { name: "Brown", rgb: [115, 80, 50] },
];

/**
 * Very coarse average-pixel colour estimate inside a bounding box.
 * This is a heuristic, not a model output — always label it as such in the UI.
 */
export function estimateBoxColor(
  canvas: HTMLCanvasElement,
  box: [number, number, number, number],
): string | null {
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  const [bx, by, bw, bh] = box;
  // Sample the middle half of the box to avoid background bleed.
  const x = Math.max(0, Math.round(bx + bw * 0.25));
  const y = Math.max(0, Math.round(by + bh * 0.25));
  const w = Math.max(1, Math.min(Math.round(bw * 0.5), canvas.width - x));
  const h = Math.max(1, Math.min(Math.round(bh * 0.5), canvas.height - y));
  if (w < 1 || h < 1) return null;

  let data: Uint8ClampedArray;
  try {
    data = ctx.getImageData(x, y, w, h).data;
  } catch {
    return null;
  }

  let r = 0;
  let g = 0;
  let b = 0;
  let n = 0;
  for (let i = 0; i < data.length; i += 16) {
    r += data[i] ?? 0;
    g += data[i + 1] ?? 0;
    b += data[i + 2] ?? 0;
    n += 1;
  }
  if (!n) return null;
  const avg: [number, number, number] = [r / n, g / n, b / n];

  let best = COLOR_REFERENCE[0]!;
  let bestDist = Number.POSITIVE_INFINITY;
  for (const ref of COLOR_REFERENCE) {
    const d =
      (ref.rgb[0] - avg[0]) ** 2 + (ref.rgb[1] - avg[1]) ** 2 + (ref.rgb[2] - avg[2]) ** 2;
    if (d < bestDist) {
      bestDist = d;
      best = ref;
    }
  }
  return best.name;
}

/** Draws model bounding boxes onto a canvas 2D context. */
export function drawDetections(
  ctx: CanvasRenderingContext2D,
  detections: DetectedObject[],
  scale = 1,
) {
  ctx.lineWidth = Math.max(2, 2 * scale);
  ctx.font = `${Math.max(12, 13 * scale)}px "IBM Plex Mono", monospace`;
  ctx.textBaseline = "top";
  for (const d of detections) {
    const [x, y, w, h] = d.bbox;
    const label = `${d.class} ${(d.score * 100).toFixed(1)}%`;
    ctx.strokeStyle = "#22c55e";
    ctx.strokeRect(x, y, w, h);
    const textWidth = ctx.measureText(label).width + 8;
    ctx.fillStyle = "rgba(15, 23, 42, 0.85)";
    ctx.fillRect(x, Math.max(0, y - 20), textWidth, 20);
    ctx.fillStyle = "#e2f7e8";
    ctx.fillText(label, x + 4, Math.max(0, y - 18));
  }
}
