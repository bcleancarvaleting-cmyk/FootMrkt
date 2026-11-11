import { pendingTransferNews } from "@/server/notifications";
import { cardViews } from "@/server/views";
import { TransferNews } from "./transfer-news";

/** Loads any transfer news this manager hasn't accepted yet, with their card at the new club. */
export async function TransferNewsGate({ userId }: { userId: string }) {
  const news = await pendingTransferNews(userId).catch(() => []);
  if (!news.length) return null;
  const cards = await cardViews({ id: { in: news.map((n) => n.cardId) } });
  const byId = new Map(cards.map((c) => [c.id, c]));
  return <TransferNews notices={news.map((n) => ({ ...n, card: byId.get(n.cardId) ?? null }))} />;
}
