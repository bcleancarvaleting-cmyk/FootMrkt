"use client";

import { Children, useCallback, useEffect, useRef, useState } from "react";

/**
 * Swipeable hero: native scroll-snap (touch and trackpad swipe), arrows, dots and a gentle
 * auto-advance that pauses on hover/focus and is off for reduced motion.
 */
export function HeroCarousel({ labels, children }: { labels: string[]; children: React.ReactNode }) {
  const track = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const count = Children.count(children);

  const go = useCallback(
    (i: number) => {
      const el = track.current;
      if (!el) return;
      const next = (i + count) % count;
      el.scrollTo({ left: next * el.clientWidth, behavior: "smooth" });
    },
    [count],
  );

  useEffect(() => {
    const el = track.current;
    if (!el) return;
    const onScroll = () => setIndex(Math.round(el.scrollLeft / Math.max(1, el.clientWidth)));
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (paused || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const t = setInterval(() => go(index + 1), 7000);
    return () => clearInterval(t);
  }, [index, paused, go]);

  return (
    <section
      className="relative"
      aria-roledescription="carousel"
      aria-label="MATCHX highlights"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
    >
      <div ref={track} className="flex snap-x snap-mandatory overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {Children.map(children, (child, i) => (
          <div className="w-full shrink-0 snap-start" role="group" aria-roledescription="slide" aria-label={`${i + 1} of ${count}: ${labels[i] ?? ""}`}>
            {child}
          </div>
        ))}
      </div>
      <div className="mt-4 flex items-center justify-center gap-3 px-4">
        <button type="button" onClick={() => go(index - 1)} className="btn-ghost hidden h-9 w-9 shrink-0 rounded-full p-0 sm:inline-flex" aria-label="Previous slide">
          ‹
        </button>
        <div className="flex min-w-0 gap-1 overflow-x-auto [scrollbar-width:none] sm:gap-2 [&::-webkit-scrollbar]:hidden" role="tablist" aria-label="Slides">
          {labels.map((l, i) => (
            <button
              key={l}
              type="button"
              role="tab"
              aria-selected={i === index}
              onClick={() => go(i)}
              className={`shrink-0 whitespace-nowrap rounded-full px-2.5 py-1.5 text-[10px] font-extrabold uppercase tracking-[0.1em] transition sm:px-3 sm:text-[11px] sm:tracking-[0.12em] ${i === index ? "bg-accent text-accent-ink" : "text-muted hover:text-fg"}`}
            >
              {l}
            </button>
          ))}
        </div>
        <button type="button" onClick={() => go(index + 1)} className="btn-ghost hidden h-9 w-9 shrink-0 rounded-full p-0 sm:inline-flex" aria-label="Next slide">
          ›
        </button>
      </div>
    </section>
  );
}
