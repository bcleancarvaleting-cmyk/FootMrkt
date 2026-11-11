/**
 * Where the football data comes from, for the footer and the Data & licensing page.
 * Set DATA_PROVIDER=sportmonks once the Sportmonks feed is connected and supplying the squads
 * and stats; until then the honest credit is the development data.
 */
export const usingSportmonks = () => process.env.DATA_PROVIDER === "sportmonks";

export function dataCredit() {
  return usingSportmonks() ? "Football data powered by Sportmonks." : "Development build: squads from Wikipedia (CC BY-SA), match data simulated.";
}
