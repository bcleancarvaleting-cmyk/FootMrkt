"use client";

import { toPng } from "html-to-image";
import { useRef, useState } from "react";

/** Shows a poster scaled down to fit, with a button that downloads it as a full-size PNG. */
export function PosterExport({ children, filename, width, height, scale }: { children: React.ReactNode; filename: string; width: number; height: number; scale: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function download() {
    if (!ref.current) return;
    setBusy(true);
    setError(null);
    try {
      await document.fonts.ready;
      const url = await toPng(ref.current, { width, height, pixelRatio: 1, cacheBust: true });
      const a = document.createElement("a");
      a.href = url;
      a.download = `${filename}.png`;
      a.click();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't make the image");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="flex flex-col items-start gap-3">
      <div className="overflow-hidden rounded-xl border border-ink-700" style={{ width: width * scale, height: height * scale }}>
        <div style={{ transform: `scale(${scale})`, transformOrigin: "top left", width, height }}>
          <div ref={ref} data-poster style={{ width, height }}>
            {children}
          </div>
        </div>
      </div>
      {scale < 1 && (
        <button type="button" className="btn-primary px-4 py-2 text-xs" onClick={download} disabled={busy}>
          {busy ? "Making PNG…" : "Download PNG"}
        </button>
      )}
      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  );
}
