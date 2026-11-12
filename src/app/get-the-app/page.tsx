import Link from "next/link";
import { TakeItOnTheGo } from "@/components/app-install";
import { PageHeader } from "@/components/page-header";

export const metadata = { title: "Get the app", description: "Install MATCHX on your phone for 4 free player picks — a top performer from every league." };

/** Where the welcome email sends people: why to install, and how, on iPhone and Android. */
export default function GetTheApp() {
  return (
    <div className="space-y-8">
      <PageHeader eyebrow="App only" title="4 free player picks" intro="Install MATCHX on your phone and we'll give you a pick from each league: choose 1 of 4 of its top 50 performers this season. They're on loan for your first 4 gameweeks." />
      <ul className="grid gap-3 sm:grid-cols-4">
        {[
          ["Premier League", "1 of 4 top performers"],
          ["Championship", "1 of 4 top performers"],
          ["League One", "1 of 4 top performers"],
          ["League Two", "1 of 4 top performers"],
        ].map(([l, d]) => (
          <li key={l} className="panel p-4">
            <p className="eyebrow text-lime">Pick</p>
            <p className="mt-1 font-display text-2xl font-bold uppercase italic leading-none">{l}</p>
            <p className="mt-1 text-xs text-muted">{d}</p>
          </li>
        ))}
      </ul>
      <TakeItOnTheGo />
      <p className="text-sm text-muted">
        Your picks appear in <Link href="/packs" className="text-lime underline">Packs</Link> the first time you open MATCHX from your home screen while logged in. 32 players from your starter packs + 4 picks = 36 players to start your journey.
      </p>
    </div>
  );
}
