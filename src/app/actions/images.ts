"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/server/auth/session";
import { db } from "@/server/db";
import { DomainError } from "@/server/errors";
import { checkImageUrl, findPlayerByName, saveUpload, setEntityImage, setHeroCards, setHeroPhoto } from "@/server/site-images";
import { type ActionResult, attempt } from "./result";

const refresh = () => revalidatePath("/", "layout");

/** The image chosen in a form: an uploaded file wins, then a pasted link. */
async function imageFrom(form: FormData, adminId: string): Promise<string> {
  const file = form.get("file");
  if (file instanceof File && file.size) {
    return saveUpload(adminId, { bytes: new Uint8Array(await file.arrayBuffer()), type: file.type, name: file.name });
  }
  const url = String(form.get("url") ?? "").trim();
  if (!url) throw new DomainError("IMAGE", "Upload an image or paste a link.");
  return checkImageUrl(url);
}

export async function heroCardsAction(_: ActionResult | null, form: FormData): Promise<ActionResult> {
  const admin = await requireAdmin();
  const res = await attempt(
    () => setHeroCards(admin.id, [0, 1, 2].map((i) => ({ name: String(form.get(`name${i}`) ?? ""), look: String(form.get(`look${i}`) ?? "GOLD") }))),
    "Saved — the homepage shows these cards now.",
  );
  refresh();
  return res;
}

export async function heroPhotoAction(_: ActionResult | null, form: FormData): Promise<ActionResult> {
  const admin = await requireAdmin();
  const reset = form.get("reset") === "1";
  const res = await attempt(async () => setHeroPhoto(admin.id, String(form.get("slot")), reset ? null : await imageFrom(form, admin.id)), reset ? "Back to the original photo." : "Photo updated.");
  refresh();
  return res;
}

/** Player photo, club badge or league logo. "Reset" hands it back to Sportmonks (next squad sync). */
export async function entityImageAction(_: ActionResult | null, form: FormData): Promise<ActionResult> {
  const admin = await requireAdmin();
  const kind = String(form.get("kind")) as "player" | "club" | "league";
  const reset = form.get("reset") === "1";
  const res = await attempt(async () => {
    if (!["player", "club", "league"].includes(kind)) throw new DomainError("KIND", "Unknown image.");
    let id = String(form.get("id") ?? "");
    if (kind === "player") {
      const p = id ? await db.player.findUniqueOrThrow({ where: { id }, select: { id: true, displayName: true } }) : await findPlayerByName(String(form.get("player") ?? ""));
      id = p.id;
    }
    if (!id) throw new DomainError("PICK", "Pick one first.");
    await setEntityImage(admin.id, kind, id, reset ? null : await imageFrom(form, admin.id));
  }, reset ? "Reset — Sportmonks' image comes back at the next squad sync." : "Image updated.");
  refresh();
  return res;
}
