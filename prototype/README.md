# COLLECTR Play — clickable prototype

`collectr-play.html` is a single, self-contained page for trying ideas quickly. Open it in any browser — no server, database or install needed.

- Real 2026-27 players (a 340-player sample from `prisma/data/football-2026-27.json`).
- Open packs, build a squad in any of the four formations, play a simulated gameweek with auto-subs and rewards, complete sets for MP credit, chat (bots reply), light/dark switch.
- Everything is saved in the browser's local storage; **Me → Start over** resets it.

It mirrors the real app's design and rules but is not connected to it: change it freely to explore ideas, then port what works into `src/`.
