import { ClubNameSchema, CrestSchema, toCrest } from "@/lib/crest";
import { db } from "./db";

/** The manager's own club (name + crest). */
export async function myClub(userId: string) {
  const u = await db.user.findUniqueOrThrow({ where: { id: userId }, select: { clubName: true, crest: true, displayName: true } });
  return { clubName: u.clubName, crest: toCrest(u.crest), displayName: u.displayName };
}

/** Save the club name and crest design. Both are validated; the crest is stored as a small JSON record. */
export async function saveClub(userId: string, input: { clubName: unknown; crest: unknown }) {
  const clubName = ClubNameSchema.parse(input.clubName);
  const crest = CrestSchema.parse(input.crest);
  await db.user.update({ where: { id: userId }, data: { clubName, crest } });
  return { clubName, crest };
}
