"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { choosePickAction } from "@/app/actions/account";
import type { ActionResult } from "@/app/actions/result";
import { ResultText } from "./action-button";

export function PickButton({ entitlementId, playerId, name }: { entitlementId: string; playerId: string; name: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [res, setRes] = useState<ActionResult<unknown> | null>(null);
  return (
    <span className="flex flex-col items-center gap-1">
      <button
        type="button"
        className="btn-primary"
        disabled={pending}
        onClick={() => {
          if (!window.confirm(`Keep ${name}? You can't change your mind.`)) return;
          start(async () => {
            const r = await choosePickAction(entitlementId, playerId);
            if (r.ok) router.push(`/packs/opening/${r.data.openingId}`);
            else setRes(r);
          });
        }}
      >
        {pending ? "Signing…" : `Keep ${name}`}
      </button>
      {res && <ResultText result={res} />}
    </span>
  );
}
