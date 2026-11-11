/**
 * Where the football data comes from, for the footer and the Data & licensing page. Follows the
 * provider switched on in Admin → Integrations (or DATA_PROVIDER); until Sportmonks supplies the
 * squads and stats, the honest credit is the development data.
 */
export async function usingSportmonks() {
  const { loadIntegrationState } = await import("@/server/integrations");
  return (await loadIntegrationState()).provider === "sportmonks";
}

export async function dataCredit() {
  return (await usingSportmonks()) ? "Football data powered by Sportmonks." : "Development build: squads from Wikipedia (CC BY-SA), match data simulated.";
}
