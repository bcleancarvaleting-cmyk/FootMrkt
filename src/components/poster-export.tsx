"use client";

import { toCanvas, toPng } from "html-to-image";
import { useRef, useState } from "react";

/**
 * Shows a poster scaled down to fit, with buttons to download or share it as a PNG, or as a short
 * looping video in which the card finishes (Rainbow, Ruby, Diamond) shimmer.
 *
 * Sharing uses the phone's own Share sheet (Facebook, Instagram, WhatsApp…), so posting to the
 * MATCHX Facebook Page is: Share → Facebook → choose the Page. Posting straight to the Page from
 * the site would need a Meta-approved Facebook app.
 */
const VIDEO_SECONDS = 6; // one full turn of the Rainbow colour cycle
const FPS = 10;

export function PosterExport({ children, filename, width, height, scale }: { children: React.ReactNode; filename: string; width: number; height: number; scale: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [made, setMade] = useState<File | null>(null);
  // Set when the file is ready but the phone needs a fresh tap to open the Share sheet.
  const [tapToShare, setTapToShare] = useState(false);

  async function png() {
    await document.fonts.ready;
    // Safari sometimes leaves images out of the first capture; the second one has them.
    await toPng(ref.current!, { width, height, pixelRatio: 1 }).catch(() => null);
    const url = await toPng(ref.current!, { width, height, pixelRatio: 1, cacheBust: true });
    const blob = await (await fetch(url)).blob();
    return new File([blob], `${filename}.png`, { type: "image/png" });
  }

  /** Step every animation in the poster through one loop, capture each frame, and record them as a video. */
  async function video() {
    const el = ref.current!;
    await document.fonts.ready;
    const anims = el.getAnimations({ subtree: true });
    anims.forEach((a) => a.pause());
    const frames: HTMLCanvasElement[] = [];
    const total = VIDEO_SECONDS * FPS;
    try {
      await toCanvas(el, { width, height, pixelRatio: 1 }).catch(() => null); // warm-up (Safari images)
      for (let i = 0; i < total; i++) {
        const t = (i / FPS) * 1000;
        anims.forEach((a) => (a.currentTime = t));
        frames.push(await toCanvas(el, { width, height, pixelRatio: 1 }));
        setBusy(`Making video… ${Math.round(((i + 1) / total) * 100)}%`);
      }
    } finally {
      anims.forEach((a) => a.play());
    }
    const type = ["video/mp4;codecs=avc1", "video/mp4", "video/webm;codecs=vp9", "video/webm"].find((t) => typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(t));
    if (!type) throw new Error("This browser can't record video. Try Safari on iPhone or Chrome.");
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(frames[0], 0, 0);
    const rec = new MediaRecorder(canvas.captureStream(FPS), { mimeType: type, videoBitsPerSecond: 6_000_000 });
    const chunks: Blob[] = [];
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    const done = new Promise<void>((r) => (rec.onstop = () => r()));
    rec.start();
    // Play the loop twice so the clip is long enough for a reel.
    for (let loop = 0; loop < 2; loop++) {
      for (const f of frames) {
        ctx.drawImage(f, 0, 0);
        await new Promise((r) => setTimeout(r, 1000 / FPS));
      }
    }
    rec.stop();
    await done;
    const ext = type.startsWith("video/mp4") ? "mp4" : "webm";
    return new File([new Blob(chunks, { type: type.split(";")[0] })], `${filename}.${ext}`, { type: type.split(";")[0] });
  }

  async function run(label: string, make: () => Promise<File>, action: "download" | "share") {
    if (!ref.current) return;
    setBusy(label);
    setError(null);
    setTapToShare(false);
    try {
      const file = await make();
      setMade(file);
      if (action === "share") await share(file);
      else save(file);
    } catch (e) {
      if (e instanceof DOMException && e.name === "NotAllowedError") setTapToShare(true);
      else if (!(e instanceof DOMException && e.name === "AbortError")) setError(e instanceof Error ? e.message : "Couldn't make it");
    } finally {
      setBusy(null);
    }
  }

  async function share(file: File) {
    if (navigator.canShare?.({ files: [file] })) await navigator.share({ files: [file], title: "MATCHX" });
    else {
      save(file);
      setError("Sharing isn't available in this browser, so it was downloaded instead. On your phone, Share opens Facebook, Instagram and more.");
    }
  }
  function save(file: File) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(file);
    a.download = file.name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
  }

  return (
    <div className="flex max-w-full flex-col items-start gap-3">
      <div className="max-w-full overflow-x-auto">
      <div className="overflow-hidden rounded-xl border border-ink-700" style={{ width: width * scale, height: height * scale }}>
        <div style={{ transform: `scale(${scale})`, transformOrigin: "top left", width, height }}>
          <div ref={ref} data-poster style={{ width, height }}>
            {children}
          </div>
        </div>
      </div>
      </div>
      {scale < 1 && (
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn-primary px-4 py-2 text-xs" onClick={() => run("Making image…", png, "share")} disabled={!!busy}>
            Share image
          </button>
          <button type="button" className="btn-primary px-4 py-2 text-xs" onClick={() => run("Making video…", video, "share")} disabled={!!busy}>
            Share video (shimmer)
          </button>
          <button type="button" className="btn-ghost px-4 py-2 text-xs" onClick={() => run("Making image…", png, "download")} disabled={!!busy}>
            Download PNG
          </button>
          <button type="button" className="btn-ghost px-4 py-2 text-xs" onClick={() => run("Making video…", video, "download")} disabled={!!busy}>
            Download video
          </button>
        </div>
      )}
      {busy && <p className="text-xs text-muted" role="status">{busy} Keep this page open.</p>}
      {made && !busy && (
        <button
          type="button"
          className={tapToShare ? "btn-primary animate-pulse px-4 py-2 text-xs" : "text-xs text-lime underline"}
          onClick={() => share(made).then(() => setTapToShare(false)).catch((e) => !(e instanceof DOMException && e.name === "AbortError") && setError(e instanceof Error ? e.message : "Couldn't share"))}
        >
          {tapToShare ? `Ready — tap to share the ${made.type.startsWith("video") ? "video" : "image"}` : `Share the ${made.type.startsWith("video") ? "video" : "image"} again`}
        </button>
      )}
      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  );
}
