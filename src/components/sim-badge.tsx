/** The SIM tag: this game's results are simulated from the players' real form, not real football. */
export function SimBadge({ className = "" }: { className?: string }) {
  return (
    <span
      className={`inline-flex items-center rounded bg-[#8fe3ff] px-1.5 py-0.5 text-[10px] font-black uppercase tracking-[0.14em] text-[#04121a] ${className}`}
      title="Simulated matchday — results are simulated from each player's real form and value"
    >
      SIM
    </span>
  );
}
