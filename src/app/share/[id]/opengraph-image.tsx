import { ImageResponse } from "next/og";
import { packHeadline, publicOpening } from "@/server/share";

export const alt = "A MATCHX pack opening";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const TIER = { GOLD: ["#f0cb5a", "#7d5a0e"], SILVER: ["#d3d9e0", "#59626e"], BRONZE: ["#cd8a57", "#6b3b1d"] } as const;

/** Share image for Facebook: who opened which pack, and the players they pulled. */
export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const o = await publicOpening(id);
  const cards = (o?.cards ?? []).slice(0, 6);
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", background: "#060708", color: "#f4f5f2", padding: 56 }}>
        <div style={{ display: "flex", alignItems: "center", fontSize: 40, fontWeight: 800, fontStyle: "italic", letterSpacing: 2 }}>
          MATCH<span style={{ color: "#adfc07" }}>X</span>
          <span style={{ marginLeft: "auto", fontSize: 22, color: "#a3a8a0", fontStyle: "normal", fontWeight: 600 }}>{o?.pack ?? "Pack opening"}</span>
        </div>
        <div style={{ display: "flex", fontSize: 60, fontWeight: 800, marginTop: 28, lineHeight: 1.05 }}>
          {o ? `${o.manager} pulled ${packHeadline(o.cards)}` : "Open packs. Pick your seven."}
        </div>
        <div style={{ display: "flex", gap: 18, marginTop: 40 }}>
          {cards.map((c) => (
            <div
              key={c.id}
              style={{
                display: "flex",
                flexDirection: "column",
                justifyContent: "flex-end",
                width: 166,
                height: 230,
                borderRadius: 20,
                padding: 14,
                background: `linear-gradient(160deg, ${TIER[c.category][0]}, ${TIER[c.category][1]})`,
                color: "#0a0d02",
              }}
            >
              <div style={{ display: "flex", fontSize: 16, fontWeight: 800, opacity: 0.7 }}>{c.position}</div>
              <div style={{ display: "flex", fontSize: 24, fontWeight: 800, lineHeight: 1.05 }}>{c.name}</div>
              <div style={{ display: "flex", fontSize: 15, fontWeight: 600, opacity: 0.75 }}>{c.clubShort ?? ""}</div>
            </div>
          ))}
        </div>
        <div style={{ display: "flex", marginTop: "auto", fontSize: 24, color: "#adfc07", fontWeight: 700 }}>Play free at MATCHX · 14 players when you join</div>
      </div>
    ),
    { ...size },
  );
}
