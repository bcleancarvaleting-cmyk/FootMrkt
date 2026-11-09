"use client";

import { useState, useTransition } from "react";
import { applyValuesAction, previewValuesAction } from "@/app/actions/values";
import type { ActionResult } from "@/app/actions/result";
import type { ValuePreviewRow } from "@/server/market-values";
import { ResultText } from "./action-button";

type Preview = { rows: ValuePreviewRow[]; unmatched: Array<{ line: number; text: string; reason: string }> };
const gbp = (n: number) => (n >= 1e6 ? `£${(n / 1e6).toFixed(n % 1e6 ? 2 : 0)}m` : `£${Math.round(n / 1e3)}k`);
const TIER_CLS: Record<string, string> = { GOLD: "text-gold", SILVER: "text-silver", BRONZE: "text-bronze" };

export function ValuesImport() {
  const [text, setText] = useState("");
  const [source, setSource] = useState("Transfermarkt — Top flight, England");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [result, setResult] = useState<ActionResult<unknown> | null>(null);
  const [pending, start] = useTransition();
  const changes = preview?.rows.filter((r) => r.from !== r.to) ?? [];
  const counts = { GOLD: 0, SILVER: 0, BRONZE: 0 } as Record<string, number>;
  preview?.rows.forEach((r) => counts[r.to]++);

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-[1fr_280px]">
        <div>
          <label className="label" htmlFor="values-text">
            Paste the table
          </label>
          <textarea
            id="values-text"
            className="input min-h-48 font-mono text-xs"
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              setPreview(null);
              setResult(null);
            }}
            placeholder={"Copy the results table and paste it here, e.g.\nBukayo Saka   Right Winger   Arsenal FC   £120.00m\nDeclan Rice   Defensive Midfield   Arsenal FC   £100.00m"}
          />
        </div>
        <div>
          <label className="label" htmlFor="values-source">
            Source (saved with each value)
          </label>
          <input id="values-source" className="input" value={source} onChange={(e) => setSource(e.target.value)} />
          <p className="mt-2 text-xs text-faint">Euro values are converted at €1 = £0.85. Lines without a recognised player are listed below so you can check them.</p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          className="btn-ghost"
          disabled={pending || !text.trim()}
          onClick={() =>
            start(async () => {
              const r = await previewValuesAction(text);
              if (r.ok) setPreview(r.data);
              else setResult(r);
            })
          }
        >
          {pending && !preview ? "Reading…" : "Preview"}
        </button>
        <button
          className="btn-gold"
          disabled={pending || !preview || preview.rows.length === 0}
          onClick={() => start(async () => setResult(await applyValuesAction(text, source)))}
        >
          Apply {preview ? `${preview.rows.length} values` : ""}
        </button>
        {result && <ResultText result={result} />}
      </div>

      {preview && (
        <div className="space-y-3">
          <p className="text-sm">
            <b>{preview.rows.length}</b> players matched → <span className="text-gold">{counts.GOLD} Gold</span> ·{" "}
            <span className="text-silver">{counts.SILVER} Silver</span> · <span className="text-bronze">{counts.BRONZE} Bronze</span> ·{" "}
            <b>{changes.length}</b> tier change{changes.length === 1 ? "" : "s"}
            {preview.unmatched.length > 0 && <span className="text-warn"> · {preview.unmatched.length} lines not matched</span>}
          </p>
          <div className="max-h-96 overflow-auto rounded-2xl border border-ink-700">
            <table className="w-full min-w-[560px] text-sm">
              <thead className="sticky top-0 bg-ink-850 text-left text-[10px] uppercase tracking-[0.14em] text-faint">
                <tr>
                  <th className="px-3 py-2">Player</th>
                  <th className="px-3 py-2">Club</th>
                  <th className="px-3 py-2 text-right">Value</th>
                  <th className="px-3 py-2">Tier</th>
                </tr>
              </thead>
              <tbody>
                {[...preview.rows]
                  .sort((a, b) => Number(b.from !== b.to) - Number(a.from !== a.to) || b.valueGbp - a.valueGbp)
                  .map((r) => (
                    <tr key={r.playerId} className="table-row">
                      <td className="px-3 py-1.5 font-semibold">{r.name}</td>
                      <td className="px-3 py-1.5 text-muted">{r.club}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums">{gbp(r.valueGbp)}</td>
                      <td className="px-3 py-1.5">
                        {r.from === r.to ? (
                          <span className={TIER_CLS[r.to]}>{r.to.toLowerCase()}</span>
                        ) : (
                          <span>
                            <span className={`${TIER_CLS[r.from ?? ""] ?? "text-faint"} line-through opacity-60`}>{(r.from ?? "none").toLowerCase()}</span>{" "}
                            → <b className={TIER_CLS[r.to]}>{r.to.toLowerCase()}</b>
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
          {preview.unmatched.length > 0 && (
            <details className="text-xs text-muted">
              <summary className="cursor-pointer text-warn">Lines not matched ({preview.unmatched.length})</summary>
              <ul className="mt-2 space-y-1">
                {preview.unmatched.slice(0, 200).map((u) => (
                  <li key={u.line}>
                    <span className="text-faint">line {u.line}:</span> {u.text.slice(0, 120)} <span className="text-warn">— {u.reason}</span>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}
    </div>
  );
}
