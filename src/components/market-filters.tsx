"use client";

import { useRef } from "react";

/**
 * Market filters as dropdowns — League · Position · Type · Sort — plus search. Choosing an option
 * applies it straight away (it's a plain GET form, so links and the back button keep working).
 */
export type FilterSelect = { name: string; label: string; value: string; options: Array<[string, string]> };

export function MarketFilters({ action, q, selects, placeholder = "Search for a player or club" }: { action: string; q?: string; selects: FilterSelect[]; placeholder?: string }) {
  const form = useRef<HTMLFormElement>(null);
  const active = selects.filter((s) => s.value && s.name !== "sort").length;
  return (
    <form
      ref={form}
      action={action}
      role="search"
      className="space-y-2"
      onSubmit={(e) => {
        // Leave empty choices out of the link (…?pos=MID, not …?q=&league=&pos=MID).
        const els = [...e.currentTarget.elements].filter((el): el is HTMLInputElement | HTMLSelectElement => (el instanceof HTMLInputElement || el instanceof HTMLSelectElement) && !!el.name && !el.value);
        els.forEach((el) => (el.disabled = true));
        setTimeout(() => els.forEach((el) => (el.disabled = false)), 0);
      }}
    >
      <div className="flex gap-2">
        <label htmlFor="mf-q" className="sr-only">{placeholder}</label>
        <input id="mf-q" name="q" type="search" defaultValue={q} placeholder={placeholder} className="input min-w-0 flex-1" />
        <button className="btn-primary shrink-0 px-4">Search</button>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {selects.map((s) => (
          <label key={s.name} className="block min-w-0">
            <span className="mb-1 block text-[10px] font-bold uppercase tracking-[0.14em] text-faint">{s.label}</span>
            <select name={s.name} defaultValue={s.value} onChange={() => form.current?.requestSubmit()} className={`input w-full py-2.5 ${s.value && s.name !== "sort" ? "border-accent text-fg" : ""}`}>
              {s.options.map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </label>
        ))}
      </div>
      {active > 0 && (
        <a href={action + (q ? `?q=${encodeURIComponent(q)}` : "")} className="inline-block text-xs font-bold text-lime">
          Clear {active} filter{active > 1 ? "s" : ""} ×
        </a>
      )}
    </form>
  );
}
