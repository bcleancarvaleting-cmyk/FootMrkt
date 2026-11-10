/**
 * Legal pages. DRAFTS written for the soft launch — every page must be reviewed by a UK solicitor
 * before real money is enabled (paid packs, deposits, withdrawals and trading are legal-gated).
 */
export interface LegalDoc {
  slug: string;
  title: string;
  summary: string;
  sections: Array<[string, string[]]>;
}

export const LEGAL_UPDATED = "10 November 2026";

export const LEGAL_DOCS: LegalDoc[] = [
  {
    slug: "terms",
    title: "Terms of use",
    summary: "The rules for using MATCHX, your account, MP, packs, transfers and matches.",
    sections: [
      ["Who we are", ["MATCHX is a football card collecting and fantasy game. These terms are a contract between you and the operator of MATCHX. By creating an account you agree to them."]],
      ["Eligibility", ["You must be 18 or over and live in the United Kingdom. One account per person. We may ask you to prove your age and identity, and we may close accounts that break these terms."]],
      [
        "MP (MATCHX Points)",
        [
          "MP is the in-game balance. 1 MP is priced at £1 when you add funds.",
          "Cash MP comes from adding funds and selling cards. It can buy packs, cards and auction bids, and can be withdrawn to a UK bank account (minimum £10) once withdrawals are available.",
          "Bonus MP comes from challenges, sets and promotions. It can be spent on packs and match entries but can't be withdrawn, transferred or used to buy cards from other managers.",
          "MP is not a deposit account, e-money or an investment and earns no interest.",
        ],
      ],
      [
        "Packs",
        [
          "Packs cost the price shown (for example £2.99 by card or 2.99 MP). The odds for every pack are published on the Packs page and fixed for each pack version.",
          "What you get from a pack is random. Card values shown are estimates and can go down as well as up.",
          "Free and starter packs are untradeable.",
        ],
      ],
      [
        "Transfers and auctions",
        [
          "You can list tradeable cards for 0.10–100 MP. When a card sells, we take a 5% fee from the seller.",
          "Offers and bids hold the MP immediately. Held MP is returned if an offer is declined, withdrawn or lapses, or if you are outbid.",
          "A completed transfer is final. We may reverse transfers linked to fraud, mistakes or abuse.",
        ],
      ],
      ["Matches", ["Match points come from real-life player performance data. Results are final once a gameweek is settled, except for data corrections announced in-game. Entry fees and prizes are shown before you enter."]],
      ["Your content and chat", ["Be respectful. No hate, harassment, scams, links or personal information. Moderators can remove messages and we may suspend accounts."]],
      ["Closing your account", ["You can close your account at any time. We'll pay out any withdrawable cash MP after checks. Bonus MP and cards are lost on closure."]],
      ["Liability", ["We provide MATCHX as is. Nothing in these terms limits liability that can't be limited by law."]],
    ],
  },
  {
    slug: "risk",
    title: "Risk warning",
    summary: "Player values go up and down. Read this before adding funds.",
    sections: [
      [
        "Values go down as well as up",
        [
          "Every card has an estimated MP value based on real-world performance and how often it trades. It changes every gameweek and can fall sharply — for example after an injury, a transfer or a bad run of form.",
          "Past values and average selling prices don't predict future ones.",
        ],
      ],
      ["Packs are random", ["The cards in a pack are random. A pack can be worth less than you paid for it."]],
      ["No guaranteed resale", ["There's no guarantee anyone will buy your card, or buy it at the price you want. A 5% fee applies to every sale."]],
      ["Only spend what you can afford", ["MATCHX is entertainment, not an investment or a way to make money. Set a deposit limit in Wallet → Responsible play."]],
    ],
  },
  {
    slug: "responsible-play",
    title: "Responsible play",
    summary: "Tools and help to keep MATCHX fun.",
    sections: [
      ["Limits", ["Set a monthly deposit limit in your Wallet. Lower limits apply immediately; increases wait 24 hours."]],
      ["Take a break", ["Email support to pause your account for 24 hours, a week, a month or longer, or to close it permanently."]],
      ["Warning signs", ["Spending more than you planned, chasing losses, borrowing to play or hiding your spending are signs to stop."]],
      ["Get help", ["BeGambleAware: begambleaware.org · National Gambling Helpline (free, 24/7): 0808 8020 133 · GamCare: gamcare.org.uk"]],
      ["18+ only", ["We check age and identity before withdrawals and may ask for documents at any time."]],
    ],
  },
  {
    slug: "privacy",
    title: "Privacy policy",
    summary: "What we collect, why, and your rights under UK GDPR.",
    sections: [
      ["What we collect", ["Account details (username, email, password hash), profile details you add (name, date of birth, address, phone), game activity, chat messages, and payment and payout records."]],
      ["Why", ["To run your account and the game, to check age and identity (legal obligation), to prevent fraud, to process payments and payouts, and — only if you opt in — to send marketing."]],
      ["Sharing", ["Payment and identity-check providers, hosting providers, and authorities where the law requires it. We never sell your data."]],
      ["Keeping data", ["Financial records are kept for 6 years. Other data is deleted or anonymised within 2 years of account closure."]],
      ["Your rights", ["You can ask for a copy of your data, to correct it, to delete it, or to object to how we use it. You can complain to the ICO (ico.org.uk)."]],
      ["Cookies", ["We use a login cookie and a theme cookie only. No advertising trackers."]],
    ],
  },
  {
    slug: "data",
    title: "Data & licensing",
    summary: "Where player data, images and stats come from.",
    sections: [
      ["Development build", ["Squads come from Wikipedia (CC BY-SA). Match data is simulated during testing. Club crests and shirts are generic lookalikes, not official marks."]],
      ["Launch", ["Before launch, player data, statistics, names and images will be supplied under licence from an official data provider."]],
      ["No affiliation", ["MATCHX is not affiliated with or endorsed by any club, league or player."]],
    ],
  },
];
