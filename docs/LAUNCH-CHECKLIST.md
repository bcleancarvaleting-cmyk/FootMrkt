# MATCHX launch checklist

What's built, and what needs a person (you, a lawyer or a provider) before each switch goes on.

## Switches (Admin → Settings & flags)

| Switch | Turns on | Needs first |
| --- | --- | --- |
| `SIMULATED_DATA` **off** | Real match data only | API-Football key set, clubs and players linked (Admin → Live match data) |
| `PACK_SHOP` + `PAID_PACKS` | Buying packs by card | Legal sign-off, Stripe live keys, odds page reviewed |
| `DEPOSITS` | Topping up the wallet by card | Legal sign-off, Stripe live keys |
| `MARKET` | Player-to-player Transfer list | Legal sign-off, safeguard settings reviewed |
| `AUCTIONS` | MATCHX auctions | Legal sign-off |

Legal-gated switches can't be turned on from admin until `LEGAL_GATES_CLEARED` lists them on the server.

## For your lawyer

- Paid packs with random contents, including the Rare pack's guaranteed Ruby/Diamond/Rainbow (a 1-of-1 card can be resold for MX).
- Cash prizes on free-to-enter, free-cards-only matches.
- Weekly boosters in cash-prize matches: everyone gets one free random booster each Tuesday (never sold) and puts it on one player of their choice, one per match. Ask whether this random element affects how the cash-prize matches are treated as skill-based prize competitions.
- MX: non-withdrawable, not exchangeable for money.
- The public odds page (`/odds`), Terms, Privacy, Risk warning and Responsible play pages.
- Age verification approach (currently: date of birth declared, checked before any payment; identity checked before the first payout).

## Accounts and keys to set up

| What | Where it goes |
| --- | --- |
| API-Football (Pro plan) | `API_FOOTBALL_KEY` |
| Stripe | `PAYMENTS_PROVIDER=stripe`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`; webhook → `/api/webhooks/payments` |
| Email sending | see `.env.example` |
| Error alerts | `ERROR_WEBHOOK_URL` (Slack/Discord/any webhook) |
| Push notifications | `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` (make them once with `npx web-push generate-vapid-keys`), `VAPID_SUBJECT` |
| 5-minute job | `CRON_SECRET`, then call `/api/cron` every 5 minutes |
| Domain | `APP_URL` |

## Before opening to the public

1. Run one full real gameweek in a closed beta: create from real fixtures, watch scores update, finalise, check prizes.
2. Make a test card payment and a refund in Stripe test mode.
3. Turn off `DEV_TOOLS` and `SIMULATED_DATA`.
4. Check backups have run and that a restore works (see `docs/DEPLOY.md`).
