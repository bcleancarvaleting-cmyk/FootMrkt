import { beforeEach, describe, expect, it } from "vitest";
import { registerUser } from "@/server/auth/accounts";
import { myClub, saveClub } from "@/server/club";
import { suggestedCrests } from "@/lib/crest";
import { buildWorld, makeUser, resetDb } from "./fixtures";

beforeEach(async () => {
  await resetDb();
  await buildWorld();
});

describe("manager clubs", () => {
  it("names the club at sign-up with a starting crest, then saves the manager's own design", async () => {
    const r = await registerUser({ email: "club@test.dev", password: "correct-horse-battery", displayName: "Clubber", clubName: "Hackney Wanderers" });
    const club = await myClub(r.user.id);
    expect(club.clubName).toBe("Hackney Wanderers");
    expect(club.crest).toEqual(suggestedCrests("Hackney Wanderers")[0]);

    const design = { ...suggestedCrests("Hackney Wanderers")[3], initials: "hw", emblem: "crown" };
    await saveClub(r.user.id, { clubName: "Hackney Wanderers FC", crest: design });
    expect(await myClub(r.user.id)).toMatchObject({ clubName: "Hackney Wanderers FC", crest: { emblem: "crown", initials: "HW" } });

    await expect(saveClub(r.user.id, { clubName: "x", crest: design })).rejects.toThrow();
    await expect(saveClub(r.user.id, { clubName: "Fine Name", crest: { ...design, shape: "blob" } })).rejects.toThrow();
  });

  it("managers who signed up before clubs have no crest until they make one", async () => {
    const u = await makeUser("oldtimer");
    expect(await myClub(u.userId)).toMatchObject({ clubName: null, crest: null });
  });
});
