import { afterEach, describe, expect, it, vi } from "vitest";
import { reportError } from "@/server/monitoring";

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.ERROR_WEBHOOK_URL;
});

describe("error alerts", () => {
  it("posts to the webhook once per error, then stays quiet for a while", async () => {
    process.env.ERROR_WEBHOOK_URL = "https://hooks.example/abc";
    const fetchMock = vi.fn().mockResolvedValue(new Response("ok"));
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(console, "error").mockImplementation(() => {});
    await reportError("Server error", new Error("boom-unique-1"), { path: "/packs" });
    await reportError("Server error", new Error("boom-unique-1"), { path: "/packs" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.text).toContain("boom-unique-1");
    expect(body.content).toBe(body.text);
  });
});
