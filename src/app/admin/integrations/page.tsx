import { recentCardOrders, stripeHealth } from "@/server/market";
import { rebuildFromSportmonksAction, removeSportmonksTokenAction, runSportmonksCheckAction, setSportmonksOnAction } from "@/app/actions/integrations";
import Link from "next/link";
import { ActionButton } from "@/components/action-button";
import { diagnoseOrderAction, removeIntegrationSecretAction, sendTestEmailAction, setPaymentsModeAction } from "@/app/actions/integrations";
import { EmailFromForm, SecretForm } from "@/components/integrations-forms";
import { cardPaymentsReady, loadPayments, stripeKeyModes } from "@/server/payments/config";
import { allFlags } from "@/server/flags";
import { APP_URL } from "@/server/email/templates";
import { SportmonksTokenForm } from "@/components/integrations-forms";
import { fmtDate } from "@/lib/view";
import { db } from "@/server/db";
import { loadIntegrationState } from "@/server/integrations";
import { rebuildBlocker, rebuildStatus } from "@/server/rebuild";
import { secretInfo } from "@/server/secrets";
import type { CheckLine } from "@/server/sportmonks-check";
import { AdminTitle } from "../_parts/title";

export const metadata = { title: "Admin · Integrations" };
export const dynamic = "force-dynamic";

const MARK: Record<CheckLine["level"], string> = { ok: "text-mint", warn: "text-warn", fail: "text-danger", head: "font-semibold text-fg pt-2", info: "text-muted pl-4" };
const ICON: Record<CheckLine["level"], string> = { ok: "✓ ", warn: "! ", fail: "✗ ", head: "", info: "" };

function Step({ n, title, children, done }: { n: number; title: string; children: React.ReactNode; done?: boolean }) {
  return (
    <section className="panel space-y-3 p-5">
      <h2 className="flex items-center gap-3 font-display text-xl font-extrabold uppercase italic">
        <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm not-italic ${done ? "bg-accent text-accent-ink" : "border border-ink-600 text-muted"}`}>{done ? "✓" : n}</span>
        {title}
      </h2>
      {children}
    </section>
  );
}

export default async function Integrations() {
  const [pay, payReady, stripeSecret, stripeHook, stripePub, resendKey, emailFromRow] = await Promise.all([
    loadPayments(true),
    cardPaymentsReady(),
    secretInfo("stripe.secret"),
    secretInfo("stripe.webhook"),
    secretInfo("stripe.publishable"),
    secretInfo("resend"),
    db.appSetting.findUnique({ where: { key: "email.from" } }),
  ]);
  const emailFrom = typeof emailFromRow?.value === "string" ? emailFromRow.value : "";
  const { lastHook, stuck } = await stripeHealth();
  const keyModes = await stripeKeyModes();

  const recent = await recentCardOrders();
  const flags = await allFlags();
  const appUrl = APP_URL;
  const checklist: Array<[boolean, string, string | null]> = [
    [payReady.ready, "Payments switch on and keys saved (above)", null],
    [flags.PAID_PACKS, "Feature flag: Paid packs", "/admin/settings#flags"],
    [flags.DEPOSITS, "Feature flag: Add funds", "/admin/settings#flags"],
    [flags.PACK_SHOP, "Feature flag: Pack shop", "/admin/settings#flags"],
  ];
  const [state, token, lastCheckRow, rebuild, blocker, players] = await Promise.all([
    loadIntegrationState(true),
    secretInfo("sportmonks"),
    db.appSetting.findUnique({ where: { key: "sportmonks.lastCheck" } }),
    rebuildStatus(),
    rebuildBlocker(),
    db.$queryRaw<Array<{ n: bigint }>>`SELECT count(*) AS n FROM "Player" WHERE active AND "providerRefs" ? 'sportmonks'`.then((r) => Number(r[0]?.n ?? 0)),
  ]);
  const fromEnv = !!process.env.SPORTMONKS_API_TOKEN;
  const hasToken = state.hasSportmonksToken;
  const lastCheck = lastCheckRow?.value as { at: string; passed: boolean; lines: CheckLine[] } | undefined;
  const on = state.provider === "sportmonks";
  return (
    <>
      <AdminTitle title="Integrations" intro="Football data (Sportmonks), card payments (Stripe) and email (Resend) — keys are saved here, encrypted, with no server settings needed." />
      <p className="text-sm text-muted">
        Site address used in emails and payment pages: <code className="font-mono text-fg">{appUrl}</code>
        {appUrl.includes("onrender.com") || appUrl.includes("localhost") ? " — once playmatchx.com points at Render, set APP_URL=https://playmatchx.com on the host." : ""}
      </p>
      <h2 className="pt-2 text-3xl">Football data</h2>

      <Step n={1} title="Sportmonks API token" done={hasToken}>
        {fromEnv ? (
          <p className="text-sm text-mint">Set on the server (SPORTMONKS_API_TOKEN). To manage it here instead, remove it from the server settings.</p>
        ) : token ? (
          <p className="text-sm">
            <span className={token.readable ? "text-mint" : "text-danger"}>{token.readable ? "Saved" : "Saved, but can't be read (the server's secret changed) — enter it again"}</span> · ends in{" "}
            <code className="font-mono">••••{token.last4}</code> · {fmtDate(token.savedAt)}
          </p>
        ) : (
          <p className="text-sm text-muted">Not connected yet. On my.sportmonks.com open the menu → API → Tokens, create a token and paste it below.</p>
        )}
        {!fromEnv && <SportmonksTokenForm hasToken={!!token} />}
        {!fromEnv && token && (
          <ActionButton action={removeSportmonksTokenAction} className="btn-ghost px-4 py-2 text-xs text-danger" confirm="Remove the saved Sportmonks token? Live scores stop until a new one is saved.">
            Remove token
          </ActionButton>
        )}
      </Step>

      <Step n={2} title="Test the connection" done={!!lastCheck?.passed}>
        <p className="text-sm text-muted">
          Checks your plan&apos;s leagues, every league&apos;s clubs, a squad, and that last week&apos;s real matches add up — scorers, minutes and goals conceded. Read-only; about 15 of your 2,000 hourly calls.
        </p>
        <ActionButton action={runSportmonksCheckAction} className="btn-primary px-5 py-2.5 text-xs" disabled={!hasToken}>
          Test connection
        </ActionButton>
        {lastCheck && (
          <div className="rounded-xl border border-ink-700 bg-ink-900 p-3">
            <p className={`mb-2 text-sm font-semibold ${lastCheck.passed ? "text-mint" : "text-danger"}`}>
              {lastCheck.passed ? "Passed" : "Problems found"} · {fmtDate(new Date(lastCheck.at))}
            </p>
            <ul className="space-y-0.5 font-mono text-xs">
              {lastCheck.lines.map((l, i) => (
                <li key={i} className={MARK[l.level]}>
                  {ICON[l.level]}
                  {l.text}
                </li>
              ))}
            </ul>
          </div>
        )}
      </Step>

      <Step n={3} title="Rebuild the game from Sportmonks" done={rebuild.state === "done" || players > 1500}>
        <p className="text-sm text-muted">
          For a test site: replaces the starter data with the real 92 squads and this season&apos;s real matches, so values, tiers and form start from real results. Takes several minutes. Everyone is
          logged out and test accounts and cards are cleared; saved keys and settings are kept. Log back in with the admin account you set up on the host.
        </p>
        {rebuild.state !== "idle" && (
          <div className="rounded-xl border border-ink-700 bg-ink-900 p-3">
            <p className={`mb-2 text-sm font-semibold ${rebuild.state === "done" ? "text-mint" : rebuild.state === "failed" ? "text-danger" : "text-warn"}`}>
              {rebuild.state === "running" ? "Running… refresh to follow it" : rebuild.state === "done" ? "Finished" : `Failed: ${rebuild.error}`}
              {rebuild.startedAt ? ` · started ${fmtDate(new Date(rebuild.startedAt))}` : ""}
            </p>
            <ul className="max-h-60 space-y-0.5 overflow-y-auto font-mono text-xs text-muted">
              {rebuild.log.map((l, i) => (
                <li key={i}>{l}</li>
              ))}
            </ul>
          </div>
        )}
        {blocker ? (
          <p className="text-sm text-faint">{blocker}</p>
        ) : (
          <ActionButton
            action={rebuildFromSportmonksAction}
            className="btn-primary px-5 py-2.5 text-xs"
            disabled={!lastCheck?.passed}
            confirm="Rebuild the game from Sportmonks? Test accounts, cards and history are cleared and everyone is logged out. This takes several minutes."
          >
            Rebuild from Sportmonks
          </ActionButton>
        )}
        {!lastCheck?.passed && !blocker && <p className="text-xs text-faint">Run the connection test first — the rebuild unlocks once it passes.</p>}
      </Step>

      <Step n={4} title="Data provider" done={on}>
        <p className="text-sm">
          Now: <b>{on ? "Sportmonks" : "development data (Wikipedia squads, simulated matches)"}</b>
          {process.env.DATA_PROVIDER ? " — set on the server (DATA_PROVIDER)" : ""}.
        </p>
        <p className="text-sm text-muted">Live scores, the nightly transfer check and the &ldquo;Football data powered by Sportmonks&rdquo; credit follow this switch. The rebuild switches it on for you.</p>
        {!process.env.DATA_PROVIDER && (
          <ActionButton action={setSportmonksOnAction.bind(null, !on)} className="btn-ghost px-4 py-2 text-xs" disabled={!on && !hasToken}>
            {on ? "Switch back to development data" : "Switch data to Sportmonks"}
          </ActionButton>
        )}
      </Step>

      <h2 className="pt-6 text-3xl">Card payments</h2>
      <Step n={1} title="Stripe keys" done={!!pay.stripeKey && !!pay.webhookSecret}>
        {keyModes.secret === "TEST" && (
          <p className="rounded-xl border border-warn/50 bg-warn/10 px-3 py-2 text-sm text-warn">
            The saved secret key is a <b>TEST / sandbox</b> key, so checkout runs in Stripe&apos;s sandbox (test cards only, no real money) even with Live switched on. For real payments, paste your <b>sk_live_…</b> key from Stripe with Sandbox/Test mode switched off.
          </p>
        )}
        {keyModes.mismatch && <p className="rounded-xl border border-danger/50 bg-danger/10 px-3 py-2 text-sm text-danger">The secret and publishable keys are from different modes (one live, one test). Use both from the same mode.</p>}
        <p className="text-sm text-muted">
          In Stripe → Developers → Webhooks, add an endpoint for <code className="break-all font-mono text-xs">{appUrl}/api/webhooks/payments</code> with the events checkout.session.completed,
          checkout.session.async_payment_succeeded, checkout.session.async_payment_failed and checkout.session.expired. Then save the two keys here. Card details never touch MATCHX — players pay on Stripe&apos;s page.
        </p>
        {process.env.STRIPE_SECRET_KEY ? (
          <p className="text-sm text-mint">Secret key set on the server (STRIPE_SECRET_KEY).</p>
        ) : (
          <>
            {stripeSecret && (
              <p className="text-sm">
                <span className="text-mint">Secret key saved</span> <Mode m={keyModes.secret} /> · ends in <code className="font-mono">••••{stripeSecret.last4}</code>{" "}
                <ActionButton action={removeIntegrationSecretAction.bind(null, "stripe.secret")} className="ml-2 text-xs text-danger underline" confirm="Remove the Stripe secret key? Live card payments switch off.">
                  Remove
                </ActionButton>
              </p>
            )}
            <SecretForm name="stripe.secret" label="Stripe secret key" placeholder="sk_live_…" has={!!stripeSecret} hint="Use a restricted key if you like (rk_live_…) with write access to Checkout Sessions and Refunds." />
          </>
        )}
        {stripePub ? (
          <p className="text-sm">
            <span className="text-mint">Publishable key saved</span> <Mode m={keyModes.publishable} /> · ends in <code className="font-mono">••••{stripePub.last4}</code>
          </p>
        ) : null}
        {!process.env.STRIPE_PUBLISHABLE_KEY && <SecretForm name="stripe.publishable" label="Stripe publishable key" placeholder="pk_live_…" has={!!stripePub} hint="Optional today (checkout runs on Stripe's own page), kept for Apple Pay / Google Pay later." />}
        {process.env.STRIPE_WEBHOOK_SECRET ? (
          <p className="text-sm text-mint">Webhook secret set on the server (STRIPE_WEBHOOK_SECRET).</p>
        ) : (
          <>
            {stripeHook && (
              <p className="text-sm">
                <span className="text-mint">Webhook secret saved</span> · ends in <code className="font-mono">••••{stripeHook.last4}</code>{" "}
                <ActionButton action={removeIntegrationSecretAction.bind(null, "stripe.webhook")} className="ml-2 text-xs text-danger underline" confirm="Remove the webhook secret? Live card payments switch off.">
                  Remove
                </ActionButton>
              </p>
            )}
            <SecretForm name="stripe.webhook" label="Webhook signing secret" placeholder="whsec_…" has={!!stripeHook} />
          </>
        )}
      </Step>

      <p className={`rounded-xl border px-4 py-3 text-sm ${lastHook ? "border-mint/40 text-mint" : "border-warn/50 text-warn"}`}>
        {lastHook
          ? `✓ Stripe webhooks are arriving — last one ${fmtDate(lastHook.receivedAt)}.`
          : "No webhook from Stripe has arrived yet. Payments still complete when managers return from Stripe (the site checks with Stripe directly), but set up the webhook so packs and top-ups also arrive if someone closes the page early."}
        {stuck > 0 && <span className="block text-warn">{stuck} Stripe order{stuck > 1 ? "s are" : " is"} still waiting for confirmation.</span>}
      </p>

      <section className="panel space-y-2 p-5">
        <h3 className="font-display text-xl font-extrabold uppercase italic">Payment checks</h3>
        <p className="text-sm">
          Last webhook:{" "}
          {recent.lastWebhook ? (
            recent.lastWebhook.ok ? (
              <span className="text-mint">✓ accepted {fmtDate(new Date(recent.lastWebhook.at))} ({recent.lastWebhook.result})</span>
            ) : (
              <span className="text-danger">
                ✗ rejected {fmtDate(new Date(recent.lastWebhook.at))}: {recent.lastWebhook.error}
                {recent.lastWebhook.hadSignature === false ? " — no Stripe signature header" : ""}
              </span>
            )
          ) : (
            <span className="text-warn">none received yet</span>
          )}
        </p>
        {recent.orders.length === 0 ? (
          <p className="text-sm text-faint">No card orders yet.</p>
        ) : (
          <ul className="divide-y divide-ink-800 text-sm">
            {recent.orders.map((o) => (
              <li key={o.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span className="min-w-0">
                  <b>£{(o.amountMinor / 100).toFixed(2)}</b> · {o.kind === "PACK_PURCHASE" ? "pack" : o.kind === "DEPOSIT" ? "top-up" : o.kind.toLowerCase()} · {o.user.displayName}{" "}
                  <span className="text-faint">· {o.provider} · {fmtDate(o.createdAt)}</span>{" "}
                  <span className={o.status === "PAID" ? "text-mint" : o.status === "PENDING" ? "text-warn" : "text-danger"}>{o.status.toLowerCase()}</span>
                </span>
                {o.provider === "stripe" && (
                  <ActionButton action={diagnoseOrderAction.bind(null, o.id)} className="btn-ghost px-3 py-1.5 text-[11px]">
                    Check with Stripe
                  </ActionButton>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <Step n={2} title="Payments switch" done={payReady.ready}>
        <p className="text-sm">
          Now: <b>{pay.mode === "off" ? "Off — every £ button shows “coming soon”" : pay.mode === "test" ? "Test payments (no real money)" : "Live card payments through Stripe"}</b>
          {pay.fromEnv ? " — the server's starting setting; choose below to change it" : ""}.
        </p>
        {!payReady.ready && pay.mode !== "off" && <p className="text-sm text-warn">Not taking payments yet: {payReady.reason}</p>}
        {(
          <div className="flex flex-wrap gap-2">
            {(
              [
                ["off", "Off"],
                ["test", "Test (no real money)"],
                ["stripe", "Live (Stripe)"],
              ] as const
            ).map(([m, l]) => (
              <ActionButton
                key={m}
                action={setPaymentsModeAction.bind(null, m)}
                className={`px-4 py-2 text-xs ${pay.mode === m ? "btn-primary" : "btn-ghost"}`}
                disabled={pay.mode === m || (m === "stripe" && !(pay.stripeKey && pay.webhookSecret))}
                confirm={m === "stripe" ? "Switch on LIVE card payments? Real money will be taken." : undefined}
              >
                {l}
              </ActionButton>
            ))}
          </div>
        )}
        <div className="rounded-xl border border-ink-700 bg-ink-900 p-3 text-sm">
          <p className="mb-1 font-semibold">For the £ buttons to work, all of these must be on:</p>
          <ul className="space-y-0.5">
            {checklist.map(([ok, label, href]) => (
              <li key={label} className={ok ? "text-mint" : "text-muted"}>
                {ok ? "✓" : "○"} {label}
                {!ok && href && (
                  <Link href={href} className="ml-2 text-xs text-lime underline">
                    open
                  </Link>
                )}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-faint">
            Paid packs and Add funds are legal-gated: they only switch on once LEGAL_GATES_CLEARED on the server includes PAID_PACKS and DEPOSITS — after your lawyer and Stripe have signed off on the business model.
          </p>
        </div>
      </Step>

      <h2 className="pt-6 text-3xl">Email</h2>
      <Step n={1} title="Resend" done={!!resendKey || !!process.env.RESEND_API_KEY}>
        <p className="text-sm text-muted">
          Welcome, password reset, team-sheet, results, sales and prize emails go out through Resend. Without a key they&apos;re only logged (Admin → Emails), so password reset links never arrive.
        </p>
        {process.env.RESEND_API_KEY ? (
          <p className="text-sm text-mint">Key set on the server (RESEND_API_KEY).</p>
        ) : (
          <>
            {resendKey && (
              <p className="text-sm">
                <span className="text-mint">Key saved</span> · ends in <code className="font-mono">••••{resendKey.last4}</code>{" "}
                <ActionButton action={removeIntegrationSecretAction.bind(null, "resend")} className="ml-2 text-xs text-danger underline" confirm="Remove the Resend key? Emails will only be logged.">
                  Remove
                </ActionButton>
              </p>
            )}
            <SecretForm name="resend" label="Resend API key" placeholder="re_…" has={!!resendKey} />
          </>
        )}
        {process.env.EMAIL_FROM ? <p className="text-sm text-mint">Sender set on the server (EMAIL_FROM): {process.env.EMAIL_FROM}</p> : <EmailFromForm value={emailFrom} />}
        <ActionButton action={sendTestEmailAction} className="btn-ghost px-4 py-2 text-xs">
          Send me a test email
        </ActionButton>
      </Step>
    </>
  );
}

function Mode({ m }: { m: "LIVE" | "TEST" | "UNKNOWN" | null }) {
  if (!m) return null;
  return <span className={`ml-1 rounded px-1.5 py-0.5 text-[10px] font-extrabold ${m === "LIVE" ? "bg-mint/20 text-mint" : "bg-warn/20 text-warn"}`}>{m === "LIVE" ? "LIVE" : m === "TEST" ? "TEST · SANDBOX" : "?"}</span>;
}
