"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { saveClubAction } from "@/app/actions/account";
import type { ActionResult } from "@/app/actions/result";
import { CREST_COLOURS, CREST_EMBLEMS, CREST_PATTERNS, CREST_SHAPES, type Crest, initialsFor, suggestedCrests } from "@/lib/crest";
import { ResultText } from "./action-button";
import { ClubCrest } from "./club-crest";

const LABEL: Record<string, string> = {
  shield: "Shield",
  pointed: "Pointed",
  round: "Round",
  hexagon: "Hexagon",
  square: "Badge",
  plain: "Plain",
  stripes: "Stripes",
  hoops: "Hoops",
  halves: "Halves",
  quarters: "Quarters",
  sash: "Sash",
  chevron: "Chevron",
  none: "None",
  star: "Star",
  crown: "Crown",
  ball: "Ball",
  bolt: "Bolt",
  tower: "Tower",
  flame: "Flame",
  tree: "Oak",
};

function Swatches({ value, onChange, label }: { value: string; onChange: (c: Crest["primary"]) => void; label: string }) {
  return (
    <div>
      <p className="label">{label}</p>
      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={label}>
        {CREST_COLOURS.map((c) => (
          <button
            key={c}
            type="button"
            role="radio"
            aria-checked={value === c}
            aria-label={`${label} ${c}`}
            onClick={() => onChange(c)}
            className={`h-8 w-8 rounded-full border-2 transition ${value === c ? "scale-110 border-lime" : "border-ink-600"}`}
            style={{ background: c }}
          />
        ))}
      </div>
    </div>
  );
}

function Options<T extends string>({ label, options, value, onChange, preview }: { label: string; options: readonly T[]; value: T; onChange: (v: T) => void; preview: (v: T) => React.ReactNode }) {
  return (
    <div>
      <p className="label">{label}</p>
      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none]" role="radiogroup" aria-label={label}>
        {options.map((o) => (
          <button
            key={o}
            type="button"
            role="radio"
            aria-checked={value === o}
            onClick={() => onChange(o)}
            className={`flex w-16 shrink-0 flex-col items-center gap-1 rounded-xl border p-1.5 text-[10px] font-semibold transition ${value === o ? "border-lime bg-accent/10 text-fg" : "border-ink-700 text-muted hover:border-ink-600"}`}
          >
            {preview(o)}
            {LABEL[o] ?? o}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Name your club, pick a starting crest from a set of designs, then make it your own. */
export function CrestDesigner({ initialName, initialCrest, next, welcome }: { initialName: string; initialCrest: Crest | null; next: string; welcome: boolean }) {
  const router = useRouter();
  const [name, setName] = useState(initialName);
  const [crest, setCrest] = useState<Crest>(initialCrest ?? suggestedCrests(initialName || "My Club")[0]);
  const [initialsTouched, setInitialsTouched] = useState(!!initialCrest);
  const [pending, start] = useTransition();
  const [res, setRes] = useState<ActionResult<unknown> | null>(null);
  const designs = useMemo(() => suggestedCrests(name || "My Club"), [name]);
  const set = (patch: Partial<Crest>) => setCrest((c) => ({ ...c, ...patch }));

  function rename(v: string) {
    setName(v);
    if (!initialsTouched) set({ initials: initialsFor(v || "MX") });
  }
  function save() {
    start(async () => {
      const r = await saveClubAction({ clubName: name, crest });
      setRes(r);
      if (r.ok) router.push(next);
    });
  }

  return (
    <div className="grid gap-6 md:grid-cols-[280px_1fr]">
      {/* Live preview: a compact bar pinned under the header on phones, a big card on desktop. */}
      <div className="sticky top-[61px] z-20 -mx-4 min-w-0 bg-ink-950/95 px-4 py-2 backdrop-blur md:top-24 md:mx-0 md:self-start md:bg-transparent md:p-0 md:backdrop-blur-none">
        <div className="panel flex items-center gap-3 p-3 md:flex-col md:gap-3 md:p-6">
          <span className="shrink-0 md:hidden">
            <ClubCrest crest={crest} id="preview-sm" size={52} title={`${name || "Your club"} crest`} />
          </span>
          <span className="hidden md:block">
            <ClubCrest crest={crest} id="preview" size={150} title={`${name || "Your club"} crest`} />
          </span>
          <p className="min-w-0 flex-1 truncate font-display text-lg font-extrabold uppercase italic leading-tight md:flex-none md:text-center md:text-2xl">{name || "Your club"}</p>
          <button type="button" className="btn-primary shrink-0 px-4 py-2.5 text-[11px] md:w-full md:py-3 md:text-[13px]" disabled={pending || name.trim().length < 3} onClick={save}>
            {pending ? "Saving…" : welcome ? <><span className="md:hidden">Save</span><span className="hidden md:inline">Save &amp; open my Starter Pack</span></> : "Save club"}
          </button>
        </div>
        {res && !res.ok && (
          <div className="mt-2">
            <ResultText result={res} />
          </div>
        )}
      </div>

      <div className="min-w-0 space-y-6">
        <div>
          <label className="label" htmlFor="clubName">
            Club name
          </label>
          <input id="clubName" className="input" value={name} maxLength={30} placeholder="e.g. Hackney Wanderers" onChange={(e) => rename(e.target.value)} />
          <p className="mt-1 text-xs text-faint">3–30 characters. Shown with your crest on leaderboards and your profile.</p>
        </div>

        <div>
          <p className="label">Start from a design</p>
          <div className="grid grid-cols-4 gap-2 sm:grid-cols-8">
            {designs.map((d, i) => (
              <button
                key={i}
                type="button"
                onClick={() => {
                  setCrest({ ...d, initials: crest.initials || d.initials });
                }}
                className="flex items-center justify-center rounded-xl border border-ink-700 bg-ink-900 p-2 transition hover:border-lime"
                aria-label={`Design ${i + 1}`}
              >
                <ClubCrest crest={{ ...d, initials: crest.initials || d.initials }} id={`s${i}`} size={48} />
              </button>
            ))}
          </div>
        </div>

        <Options label="Shape" options={CREST_SHAPES} value={crest.shape} onChange={(shape) => set({ shape })} preview={(o) => <ClubCrest crest={{ ...crest, shape: o, emblem: "none", initials: "", est: false }} id={`shape-${o}`} size={30} />} />
        <Options label="Pattern" options={CREST_PATTERNS} value={crest.pattern} onChange={(pattern) => set({ pattern })} preview={(o) => <ClubCrest crest={{ ...crest, pattern: o, emblem: "none", initials: "", est: false }} id={`pat-${o}`} size={30} />} />
        <Options label="Emblem" options={CREST_EMBLEMS} value={crest.emblem} onChange={(emblem) => set({ emblem })} preview={(o) => <ClubCrest crest={{ ...crest, emblem: o, initials: "", est: false }} id={`emb-${o}`} size={30} />} />

        <div className="grid gap-5 sm:grid-cols-3">
          <Swatches label="Main colour" value={crest.primary} onChange={(primary) => set({ primary })} />
          <Swatches label="Pattern colour" value={crest.secondary} onChange={(secondary) => set({ secondary })} />
          <Swatches label="Trim & emblem" value={crest.accent} onChange={(accent) => set({ accent })} />
        </div>

        <div className="flex flex-wrap items-end gap-4">
          <div>
            <label className="label" htmlFor="initials">
              Initials
            </label>
            <input
              id="initials"
              className="input w-28 uppercase"
              value={crest.initials}
              maxLength={3}
              onChange={(e) => {
                setInitialsTouched(true);
                set({ initials: e.target.value.replace(/[^A-Za-z0-9&]/g, "").toUpperCase() });
              }}
            />
          </div>
          <label className="flex items-center gap-2 pb-3 text-sm text-muted">
            <input type="checkbox" className="accent-lime" checked={crest.est} onChange={(e) => set({ est: e.target.checked })} />
            Show &ldquo;EST. 2026&rdquo;
          </label>
        </div>
      </div>
    </div>
  );
}
