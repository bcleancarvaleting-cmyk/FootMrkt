import { GamesAdmin } from "../_parts/games";
import { OpsSections } from "../_parts/ops";
import { AdminTitle } from "../_parts/title";

export const metadata = { title: "Admin · Games" };

export default function Page() {
  return (
    <>
      <AdminTitle title="Games" intro="Create a game — real or sim — then follow it live and see the results. Every game is made by you." />
      <GamesAdmin />
      <details className="group mt-8 rounded-2xl border border-ink-700 bg-ink-900">
        <summary className="flex cursor-pointer list-none items-center justify-between px-5 py-4">
          <span>
            <b>Fixtures & tools</b>
            <span className="ml-2 text-xs text-muted">Real fixtures load on their own each day — open this only to load them now or for testing tools.</span>
          </span>
          <span className="text-muted transition group-open:rotate-180">▾</span>
        </summary>
        <div className="border-t border-ink-700 p-4">
          <OpsSections only={["gameweeks"]} />
        </div>
      </details>
    </>
  );
}
