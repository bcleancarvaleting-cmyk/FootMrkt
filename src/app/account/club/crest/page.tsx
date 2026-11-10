import { CrestDesigner } from "@/components/crest-designer";
import { PageHeader } from "@/components/page-header";
import { requireUser } from "@/server/auth/session";
import { myClub } from "@/server/club";

export const metadata = { title: "Club crest" };

export default async function CrestPage({ searchParams }: { searchParams: Promise<{ welcome?: string }> }) {
  const user = await requireUser();
  const { welcome } = await searchParams;
  const club = await myClub(user.id);
  const isWelcome = welcome === "1";
  return (
    <div>
      <PageHeader
        eyebrow={isWelcome ? "Step 1 of 2 · Your club" : "Your club"}
        title={isWelcome ? "Create your club" : "Club name & crest"}
        intro="Name your club and design its crest: start from one of the designs, then pick the shape, colours, pattern and emblem. You can change it any time."
      />
      <CrestDesigner initialName={club.clubName ?? ""} initialCrest={club.crest} next={isWelcome ? "/packs?welcome=1" : "/account/club"} welcome={isWelcome} />
    </div>
  );
}
