"use client";

import { useActionState } from "react";
import { entityImageAction, heroCardsAction, heroPhotoAction } from "@/app/actions/images";
import type { ActionResult } from "@/app/actions/result";
import { ResultText } from "./action-button";

const LOOKS = [
  ["GOLD", "Gold"],
  ["RUBY", "Ruby"],
  ["DIAMOND", "Diamond"],
  ["RAINBOW", "Rainbow"],
] as const;

export function HeroCardsForm({ cards, suggestions }: { cards: Array<{ name: string; look: string }>; suggestions: string[] }) {
  const [state, run, pending] = useActionState(heroCardsAction, null);
  return (
    <form action={run} className="space-y-3">
      <datalist id="hero-players">
        {suggestions.map((s) => (
          <option key={s} value={s} />
        ))}
      </datalist>
      <div className="grid gap-3 sm:grid-cols-3">
        {cards.map((c, i) => (
          <div key={i} className="rounded-xl border border-ink-700 p-3">
            <p className="eyebrow mb-2">{["Left", "Centre", "Right"][i]}</p>
            <label className="label" htmlFor={`hero-name${i}`}>Player</label>
            <input id={`hero-name${i}`} name={`name${i}`} list="hero-players" defaultValue={c.name} className="input" required />
            <label className="label mt-2" htmlFor={`hero-look${i}`}>Look</label>
            <select id={`hero-look${i}`} name={`look${i}`} defaultValue={c.look} className="input">
              {LOOKS.map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </select>
          </div>
        ))}
      </div>
      <div className="flex items-center gap-3">
        <button className="btn-primary px-4 py-2 text-xs" disabled={pending}>{pending ? "Saving…" : "Save homepage cards"}</button>
        {state && <ResultText result={state} />}
      </div>
    </form>
  );
}

/** Upload a file or paste a link; "Reset" goes back to the original. */
function ImageForm({
  action,
  current,
  hidden,
  children,
  resetLabel,
  round,
}: {
  action: (s: ActionResult | null, f: FormData) => Promise<ActionResult>;
  current?: string | null;
  hidden: Record<string, string>;
  children?: React.ReactNode;
  resetLabel: string;
  round?: boolean;
}) {
  const [state, run, pending] = useActionState(action, null);
  return (
    <form action={run} className="flex flex-wrap items-end gap-3 border-t border-ink-700 pt-4 first:border-0 first:pt-0">
      {Object.entries(hidden).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      {current !== undefined && (
        <span className={`flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden border border-ink-700 bg-ink-950 ${round ? "rounded-full" : "rounded-lg"}`}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {current ? <img src={current} alt="" className="h-full w-full object-contain" /> : <span className="text-[10px] text-faint">None</span>}
        </span>
      )}
      {children}
      <div className="min-w-0 basis-56">
        <label className="label">Upload</label>
        <input name="file" type="file" accept="image/png,image/jpeg,image/webp,image/gif,image/avif,image/svg+xml" className="input text-xs" />
      </div>
      <div className="min-w-0 flex-1 basis-56">
        <label className="label">…or paste a link</label>
        <input name="url" type="url" placeholder="https://…" className="input" />
      </div>
      <button className="btn-primary px-4 py-2 text-xs" disabled={pending}>{pending ? "Saving…" : "Save"}</button>
      <button name="reset" value="1" className="btn-ghost px-3 py-2 text-xs" disabled={pending} formNoValidate>
        {resetLabel}
      </button>
      {state && (
        <div className="basis-full">
          <ResultText result={state} />
        </div>
      )}
    </form>
  );
}

export function HeroPhotoForm({ slot, label, current }: { slot: string; label: string; current: string }) {
  return (
    <ImageForm action={heroPhotoAction} current={current} hidden={{ slot }} resetLabel="Original photo">
      <p className="min-w-0 basis-48 text-sm font-semibold">{label}</p>
    </ImageForm>
  );
}

export function PlayerPhotoForm() {
  return (
    <ImageForm action={entityImageAction} hidden={{ kind: "player" }} resetLabel="Back to Sportmonks">
      <div className="min-w-0 basis-56">
        <label className="label" htmlFor="img-player">Player</label>
        <input id="img-player" name="player" placeholder="Erling Haaland (or Name (ARS))" className="input" required />
      </div>
    </ImageForm>
  );
}

export function PickImageForm({ kind, options, label }: { kind: "club" | "league"; options: Array<{ id: string; name: string; url: string | null }>; label: string }) {
  return (
    <ImageForm action={entityImageAction} hidden={{ kind }} resetLabel="Back to Sportmonks">
      <div className="min-w-0 basis-56">
        <label className="label" htmlFor={`img-${kind}`}>{label}</label>
        <select id={`img-${kind}`} name="id" className="input" required defaultValue="">
          <option value="" disabled>Choose…</option>
          {options.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
              {o.url ? "" : " (no image yet)"}
            </option>
          ))}
        </select>
      </div>
    </ImageForm>
  );
}

/** A custom player photo already set: shown with a reset button. */
export function CustomPhotoRow({ id, name, club, url }: { id: string; name: string; club: string; url: string }) {
  const [state, run, pending] = useActionState(entityImageAction, null);
  return (
    <form action={run} className="flex items-center gap-3 border-t border-ink-800 py-2 first:border-0">
      <input type="hidden" name="kind" value="player" />
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="reset" value="1" />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={url} alt="" className="h-10 w-10 rounded-lg object-cover" />
      <span className="min-w-0 flex-1 truncate text-sm">
        <b>{name}</b> <span className="text-faint">· {club}</span>
      </span>
      <button className="btn-ghost px-3 py-1.5 text-xs" disabled={pending}>Back to Sportmonks</button>
      {state && <ResultText result={state} />}
    </form>
  );
}
