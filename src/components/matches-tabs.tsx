import { SectionTabs } from "./page-header";

/** Matches · Results · Your entries — the same three tabs at the top of each. */
export function MatchesTabs({ active }: { active: "/matches" | "/results" | "/matches/entries" }) {
  return (
    <SectionTabs
      active={active}
      tabs={[
        { href: "/matches", label: "Matches" },
        { href: "/results", label: "Results" },
        { href: "/matches/entries", label: "Your entries" },
      ]}
    />
  );
}
