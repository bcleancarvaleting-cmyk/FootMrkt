import { LaunchPage, type LaunchParams } from "@/components/launch-page";

export const metadata = {
  title: "MATCHX — the football card game for every English club",
  description: "Collect real players from all 92 English clubs and score points from real matches. Join the waitlist for a free pack at launch.",
  openGraph: { title: "MATCHX is coming", description: "The football card game for every English club. Save your place and get a free pack at launch." },
};

export default async function Launch({ searchParams }: { searchParams: Promise<LaunchParams> }) {
  return <LaunchPage sp={await searchParams} />;
}
