/** Community chat rooms. Add or rename rooms here. */
export const CHAT_ROOMS = [
  { id: "dugout", name: "The Dugout", blurb: "General chat for every manager" },
  { id: "matchday", name: "Matchday", blurb: "Live talk while the gameweek is on" },
  { id: "pulls", name: "Pack Pulls", blurb: "Show off what you opened" },
  { id: "tactics", name: "Tactics Board", blurb: "Squad advice, formations and picks" },
] as const;

export type ChatRoomId = (typeof CHAT_ROOMS)[number]["id"];

export const CHAT_RULES = {
  maxLength: 400,
  /** Messages per user: burst capacity and refill per minute. */
  burst: 5,
  perMinute: 12,
  /** Links are blocked to cut down on scams and phishing in a money-adjacent community. */
  blockLinks: true,
  /** Reports from this many different managers hide a message until a moderator reviews it. */
  autoHideReports: 3,
};
