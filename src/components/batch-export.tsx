"use client";

import { toPng } from "html-to-image";
import JSZip from "jszip";
import { useRef, useState } from "react";

/** A set of posters shown as thumbnails, downloadable together as one ZIP of full-size PNGs. */
export function BatchExport({ items, width, height, zipName }: { items: Array<{ filename: string; poster: React.ReactNode }>; width: number; height: number; zipName: string }) {
  const refs = useRef<Array<HTMLDivElement | null>>([]);
  const [progress, setProgress] = useState<string | null>(null);
  const thumb = 0.16;
  async function downloadAll() {
    const zip = new JSZip();
    await document.fonts.ready;
    for (const [i, item] of items.entries()) {
      const node = refs.current[i];
      if (!node) continue;
      setProgress(`Making ${i + 1} of ${items.length}…`);
      const url = await toPng(node, { width, height, pixelRatio: 1, cacheBust: true });
      zip.file(`${item.filename}.png`, url.split(",")[1], { base64: true });
    }
    setProgress("Zipping…");
    const blob = await zip.generateAsync({ type: "blob" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${zipName}.zip`;
    a.click();
    setProgress(null);
  }
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <button type="button" className="btn-primary px-4 py-2 text-xs" onClick={downloadAll} disabled={!!progress}>
          {progress ?? `Download all ${items.length} (ZIP)`}
        </button>
        <span className="text-xs text-faint">Full size PNGs, one per player.</span>
      </div>
      <div className="flex flex-wrap gap-2">
        {items.map((it, i) => (
          <div key={it.filename} className="overflow-hidden rounded-md border border-ink-700" style={{ width: width * thumb, height: height * thumb }} title={it.filename}>
            <div style={{ transform: `scale(${thumb})`, transformOrigin: "top left", width, height }}>
              <div
                ref={(el) => {
                  refs.current[i] = el;
                }}
                data-poster-batch={it.filename}
                style={{ width, height }}
              >
                {it.poster}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
