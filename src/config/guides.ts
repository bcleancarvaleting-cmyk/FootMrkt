/**
 * "Guides to MATCHX" (menu → Guides): quick how-tos for every part of the game, plus What's new.
 * Add a guide by adding an entry here; add news to WHATS_NEW (newest first). Kept short and plain.
 */
export interface Guide {
  slug: string;
  icon: string;
  title: string;
  summary: string;
  steps: Array<{ title: string; body: string; href?: string; cta?: string }>;
}

export const GUIDES: Guide[] = [
  {
    slug: "getting-started",
    icon: "🚀",
    title: "Getting started",
    summary: "Your 32 free players (36 with the app), your first squad and where everything lives.",
    steps: [
      { title: "Open your starter packs", body: "You get a full squad for the Premier League, Championship, League One and League Two — plus three league picks and two Premier League Gold loans. Open them on Packs.", href: "/packs", cta: "Go to Packs" },
      { title: "Meet your club", body: "Every player you own is in My Club, grouped by position, with their value, how they're trending and the points they've won for you.", href: "/account/club", cta: "Open My Club" },
      { title: "Pick a squad", body: "Choose a match on Matches, then 7 starters and a sub before the deadline (10 minutes before the first kick-off). Real goals, assists and clean sheets become your points.", href: "/matches", cta: "See matches" },
      { title: "Come back every day", body: "Daily logins build a streak (a free pack every 7th day), today's prediction earns XP, and new MATCHX player drops land at 10am.", href: "/", cta: "Home" },
    ],
  },
  {
    slug: "cards",
    icon: "🃏",
    title: "Cards, tiers & rare finishes",
    summary: "Bronze, Silver and Gold — and the Ruby, Diamond and one-of-one Rainbow cards.",
    steps: [
      { title: "Bronze, Silver, Gold", body: "Every card is a numbered copy of a real player. The tier comes from the player's real market value, so the best players are Gold and the scarcest." },
      { title: "Ruby, Diamond, Rainbow", body: "Gold cards can come out as a Ruby (only 20 per player, worth 2× the normal card) or a Diamond (only 10, worth 3×). Any player can come out as their Rainbow — there is only one in the whole game, worth 4×. They play exactly like the normal card.", href: "/hall-of-fame", cta: "Hall of Fame" },
      { title: "Free cards", body: "Starter, pick, loan and gift cards are yours to keep and play forever, but can't be sold. Cards from bought packs, drops and transfers can be traded." },
      { title: "Real transfers", body: "If a player moves club in real life, every copy of their card moves with them — same card, same number, same history — and you get a Transfer news alert." },
    ],
  },
  {
    slug: "matches",
    icon: "⚽",
    title: "Matches & scoring",
    summary: "How matches work, who you can pick, and how points are scored.",
    steps: [
      { title: "Choose a match", body: "Each gameweek has matches with their own rules: which cards they take (e.g. Bronze only, free cards, a free draft), the entry (free or MX) and the prize pot.", href: "/matches", cta: "See matches" },
      { title: "Pick 7 + a sub", body: "Pick a formation, a keeper, defenders, midfielders and attackers, and a sub who comes on automatically if a starter doesn't play." },
      { title: "Captain & vice", body: "Your captain scores double. If they don't play, your vice-captain takes the double instead." },
      { title: "The deadline", body: "Squads lock 10 minutes before the gameweek's first kick-off. Points come in live and are final once the data window closes." },
      { title: "Paid matches", body: "If a match has an MX entry fee and you're short, the match page offers MX bundles and brings you straight back. Withdraw before the deadline and the fee is refunded." },
    ],
  },
  {
    slug: "boosters",
    icon: "🎯",
    title: "Weekly boosters",
    summary: "A free booster every Tuesday — put it on one player for extra points.",
    steps: [
      { title: "Your weekly booster", body: "A free booster lands every Tuesday and lasts 7 days. Reveal it on Packs to see which one you got.", href: "/packs", cta: "Go to Packs" },
      { title: "Use it on one player", body: "When picking a squad, tap a player to boost them — their card gets the booster's coloured border. One booster per match." },
      { title: "The six boosters", body: "Goal Rush (+5 a goal), Assist King (+3 an assist), Clean Sheet+ (double clean-sheet points), Shield (no minus points), Super Sub (a sub's points count — subs only) and Triple Up (×3)." },
    ],
  },
  {
    slug: "transfers",
    icon: "🔁",
    title: "Transfers, auctions & drops",
    summary: "Buy and sell with other managers, run auctions and sign MATCHX drops.",
    steps: [
      { title: "Transfer list", body: "Buy from other managers or make offers, in earned MX. Sellers pay a 5% fee. Listings are final once posted.", href: "/transfers", cta: "Transfer list" },
      { title: "Auctions", body: "List a card for 3, 12 or 24 hours with a starting price, an optional buy-it-now and an optional minimum you'll accept.", href: "/transfers/auctions", cta: "Auctions" },
      { title: "MATCHX player drops", body: "New players released by MATCHX every day at 10am — one copy each, never in packs. Add the ones you want to your basket and pay for them all at once.", href: "/transfers/drops", cta: "Player drops" },
      { title: "Your basket", body: "Players in your basket aren't held — whoever pays first signs them. If you're short of MX, the basket offers bundles and brings you back to finish.", href: "/transfers/basket", cta: "Basket" },
    ],
  },
  {
    slug: "money",
    icon: "💷",
    title: "MX, XP & your wallet",
    summary: "What MX and XP are, how to top up, and what can be withdrawn.",
    steps: [
      { title: "MX", body: "MX is for building your club: buying players and packs and entering matches. Top up by card in bundles — bigger bundles include bonus MX. MX can't be withdrawn.", href: "/account/wallet#add", cta: "Add funds" },
      { title: "XP", body: "Every point your players score earns XP. XP levels you up (free packs), and you can swap XP for MX or open packs with it.", href: "/account/wallet#xp", cta: "Swap XP" },
      { title: "£ winnings", body: "Cash prizes won in matches go to your £ wallet and can be withdrawn to your bank (minimum £10) after an identity check.", href: "/account/wallet#withdraw", cta: "Wallet" },
      { title: "Your portfolio", body: "My Club shows your squad's total value, how it's moving and how many of your players play this week. Sell well and buy better to grow it.", href: "/account/club", cta: "My Club" },
    ],
  },
  {
    slug: "progress",
    icon: "🏆",
    title: "Levels, achievements & streaks",
    summary: "Level up for free packs and clear achievement stages for big XP bonuses.",
    steps: [
      { title: "Levels", body: "Your lifetime XP sets your level — from Sunday League to Legend — and each new level gives a free pack.", href: "/account/achievements", cta: "My level" },
      { title: "Achievement stages", body: "Achievements come in five stages. Finish every achievement in a stage to bank its bonus (1,000 XP for the first) and open the next, harder one." },
      { title: "Daily streak & prediction", body: "Log in every day to build your streak — every 7th day is a free pack — and answer today's prediction for XP. The bar shows how everyone's voted." },
    ],
  },
  {
    slug: "community",
    icon: "🤝",
    title: "Mini-leagues, H2H & friends",
    summary: "Play your mates in private leagues and head-to-heads, and earn packs for invites.",
    steps: [
      { title: "Mini-leagues", body: "Start a private league and share the code — your best score each gameweek counts.", href: "/leagues", cta: "Mini-leagues" },
      { title: "Head-to-head", body: "Challenge another manager directly for a gameweek.", href: "/h2h", cta: "Head-to-head" },
      { title: "Invite friends", body: "Share your link from My Account. When a friend joins and plays their first match, you get a free pack.", href: "/account", cta: "My invite link" },
    ],
  },
  {
    slug: "safer-play",
    icon: "🛟",
    title: "Safer play",
    summary: "Spending limits, time-outs and help if you need it.",
    steps: [
      { title: "Set limits", body: "Set daily, weekly or monthly spending limits, take a time-out or self-exclude any time.", href: "/account/safer-play", cta: "Safer play" },
      { title: "Know the odds", body: "Every pack's odds are published. Card values go down as well as up — only spend what you can afford.", href: "/odds", cta: "Pack odds" },
    ],
  },
];

export const guideBySlug = (slug: string) => GUIDES.find((g) => g.slug === slug);

/** What's new on MATCHX (newest first). Shown at the top of Guides. */
export const WHATS_NEW: Array<{ date: string; title: string; body: string; href?: string }> = [
  { date: "2026-11-12", title: "Matchday Live", body: "Live scores scroll across the top during games, GOAL! flashes when the net bulges, and your players' points and your live rank update as it happens.", href: "/live" },
  { date: "2026-11-12", title: "7 + 1 squads", body: "Matches now take 7 starters and just one sub — quicker to pick, easier to fill. Boosters stay the same.", href: "/matches" },
  { date: "2026-11-12", title: "4 free picks in the app", body: "Install MATCHX on your phone for a top-performer pick from every league, on loan for your first 4 gameweeks.", href: "/get-the-app" },
  { date: "2026-11-12", title: "Watched by…", body: "Cards now show how many managers are watching a player, and you're told the moment a watched player is on any market.", href: "/account/watchlist" },
  { date: "2026-11-12", title: "Team of the Week", body: "After every gameweek the 7 best performers get a ★ TOTW badge on their cards for 7 days.", href: "/top-performers#totw" },
  { date: "2026-11-12", title: "Card upgrades", body: "New challenges: trade 5 Bronze up for a Choice of Silver, or 5 Silver for a Choice of Gold.", href: "/account/challenges" },
  { date: "2026-11-12", title: "Value alerts", body: "Players on your watchlist now alert you when their value rises or falls 10% or more.", href: "/account/watchlist" },
  { date: "2026-11-12", title: "Market movers", body: "See the week's biggest risers and fallers, the most traded players and record sales.", href: "/transfers/movers" },
  { date: "2026-11-12", title: "Counter-offers", body: "Got an offer that's too low? Counter it once with your price — the buyer can accept or walk away.", href: "/transfers/mine" },
  { date: "2026-11-12", title: "Share your pull", body: "Pulled a Gold or a special? Share it as an image or video straight from the pack reveal." },
  { date: "2026-11-12", title: "Club pages", body: "Every club now has its own page with its full squad of cards — share yours with fellow fans.", href: "/teams" },
  { date: "2026-11-12", title: "Friday digest", body: "A Friday email with your players in action this weekend, your club's value and the deadline. Turn it off in Profile.", href: "/account/profile" },
  { date: "2026-11-12", title: "Top recruiters", body: "Invite the most friends in a month to win a Choice of Gold.", href: "/account" },
  { date: "2026-11-12", title: "Receipts", body: "Every card payment is listed in your Wallet with Stripe's receipt.", href: "/account/wallet#payments" },
  { date: "2026-11-11", title: "Transfer news", body: "When one of your players moves club in real life, you'll see the move, the reported fee and your card at its new club.", href: "/account/club" },
  { date: "2026-11-11", title: "Your portfolio", body: "My Club now shows your squad's total value, its trend and who's playing this week.", href: "/account/club" },
  { date: "2026-11-11", title: "Basket & MX bundles", body: "Add MATCHX drops to a basket and pay for them all at once. Top up with bundles — bigger ones include bonus MX.", href: "/transfers/basket" },
  { date: "2026-11-11", title: "Achievement stages", body: "Achievements now come in five stages, each with a big XP bonus.", href: "/account/achievements" },
  { date: "2026-11-11", title: "There's only one…", body: "Rainbow cards now carry the chant — there's only one of each player.", href: "/hall-of-fame" },
];
