# MATCHX security & safety sweep — 11 Nov 2026

What was checked, what was fixed, and how it's tested. Tests: `tests/integration/attacks.test.ts`
(plus the existing security, market, wallet, basket and integrations suites).

## Access
- **Admin area**: every `/admin` page sits behind `requireAdmin()` in the admin layout; every admin
  server action calls `requireAdmin()` itself (checked by script: every exported action outside sign-in
  checks the user). Admin user tools can't be used on yourself or other admins.
- **Blocked accounts**: blocking ends all sessions; sign-in and every session lookup refuse
  non-active accounts, so a blocked manager can't act at all.
- **Roles**: profile updates use a fixed schema — a manager can't change their own role.

## Sign-in
- Rate limits on sign-up, sign-in, 2-step codes and password-reset requests.
- **Fixed**: sign-in is now also limited per account wherever the attempts come from (password
  guessing from many addresses).
- **Fixed**: rate limits used the first `X-Forwarded-For` value, which a visitor can type themselves;
  they now use Cloudflare's / the host's own view of the address.
- Session cookie: `httpOnly`, `sameSite=lax`, `secure` in production. Reset links: one-time, 32 random
  bytes, expire. Two-step login codes can't be reused.

## Money
- Every wallet movement has a unique reference (database-enforced) and runs under a per-manager lock,
  so double-taps and retries can't pay or charge twice, and balances can't go negative.
- Tested with simultaneous requests: one drop bought by five managers at once (one wins, one charge);
  one pack opened five times at once (one set of cards); ten XP swaps at once (never overspends);
  one payment webhook replayed five times at once (one fulfilment); a forged webhook is refused.
- Card payments: Stripe-hosted checkout (no card data touches MATCHX); webhooks signature-checked;
  orders can also be confirmed by asking Stripe directly, and each order is fulfilled once.
- Silly amounts (negative, zero, fractional, enormous) are refused for listings, XP swaps and withdrawals.
- Someone else's packs, cards, listings, notifications and basket can't be opened, sold, bought from
  yourself, read-marked or changed.

## Browser
- **Added** security headers on every page: no framing (clickjacking), no MIME sniffing, referrer kept
  on-site, camera/microphone/location off, HTTPS-only (HSTS) in production.
- No raw HTML from users is rendered (React escapes everything; the only raw SVG is our own 2FA QR code).
- Server actions are protected against cross-site posting by Next.js (origin check).

## Still to do at launch
- Rate limits are kept in memory, which is right for one server. If MATCHX ever runs on several
  servers at once, move them to a shared store (e.g. Redis) and turn on Cloudflare bot protection.
- Keep the `SESSION_SECRET` on the host secret and never change it casually (it also unlocks the saved
  API keys).
- Legal review of prizes, paid packs and paid entry before switching those on for the public.
