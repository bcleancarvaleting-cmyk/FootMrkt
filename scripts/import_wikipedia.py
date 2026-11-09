#!/usr/bin/env python3
"""
Build prisma/data/football-<season>.json — leagues, clubs and first-team squads for the English
Premier League, Championship, League One, League Two and National League — from Wikipedia.

    python3 scripts/import_wikipedia.py            # fetch + parse (needs access to en.wikipedia.org)
    python3 scripts/import_wikipedia.py --offline  # re-parse the cached raw pages only

Source: English Wikipedia (text licensed CC BY-SA 4.0). The revision timestamp of every page
used is recorded in the output. This is DEVELOPMENT data: squads change constantly and the
spec (§10) requires a licensed data provider and player/club rights before commercial use.
Crests are deliberately NOT imported — they are club trademarks and need licensing.
"""
import json
import os
import re
import ssl
import sys
import time
import urllib.parse
import urllib.request

SEASON = "2026-27"
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "prisma", "data", f"football-{SEASON}.json")
CACHE = os.path.join(ROOT, ".cache", f"wikipedia-{SEASON}.json")
UA = "COLLECTR-dev-import/0.1 (development data import)"

LEAGUES = [
    ("EPL", "Premier League", 1, True, "2026–27 Premier League"),
    ("CHA", "Championship", 2, False, "2026–27 EFL Championship"),
    ("LG1", "League One", 3, False, "2026–27 EFL League One"),
    ("LG2", "League Two", 4, False, "2026–27 EFL League Two"),
    ("NL", "National League", 5, False, "2026–27 National League"),
]

# Familiar three-letter codes; everything else is derived.
SHORT = {
    "Arsenal": "ARS", "Aston Villa": "AVL", "Bournemouth": "BOU", "Brentford": "BRE", "Brighton & Hove Albion": "BHA",
    "Chelsea": "CHE", "Coventry City": "COV", "Crystal Palace": "CRY", "Everton": "EVE", "Fulham": "FUL",
    "Hull City": "HUL", "Ipswich Town": "IPS", "Leeds United": "LEE", "Liverpool": "LIV", "Manchester City": "MCI",
    "Manchester United": "MUN", "Newcastle United": "NEW", "Nottingham Forest": "NFO", "Sunderland": "SUN",
    "Tottenham Hotspur": "TOT", "West Ham United": "WHU", "Wolverhampton Wanderers": "WOL", "West Bromwich Albion": "WBA",
    "Queens Park Rangers": "QPR", "Sheffield United": "SHU", "Sheffield Wednesday": "SHW", "Bristol City": "BRC",
    "Bristol Rovers": "BRR", "Milton Keynes Dons": "MKD", "AFC Wimbledon": "WIM", "Preston North End": "PNE",
    "Birmingham City": "BIR", "Blackburn Rovers": "BLB", "Blackpool": "BPL", "Bolton Wanderers": "BOL",
    "Leyton Orient": "LEY", "Notts County": "NCO", "Forest Green Rovers": "FGR", "FC Halifax Town": "HAL",
    "AFC Fylde": "FYL", "Boreham Wood": "BWD", "Boston United": "BOS", "Southend United": "SOU",
    "Southampton": "SOT", "Stockport County": "STP", "Stoke City": "STK", "Swansea City": "SWA",
    "Swindon Town": "SWI", "Cambridge United": "CAM", "Cardiff City": "CAR", "Carlisle United": "CAR",
}

NAT = {
    "England": "ENG", "Scotland": "SCO", "Wales": "WAL", "Northern Ireland": "NIR", "Republic of Ireland": "IRL",
    "Ireland": "IRL", "France": "FRA", "Spain": "ESP", "Portugal": "POR", "Germany": "GER", "Netherlands": "NED",
    "Belgium": "BEL", "Italy": "ITA", "Brazil": "BRA", "Argentina": "ARG", "United States": "USA", "Nigeria": "NGA",
    "Ghana": "GHA", "Jamaica": "JAM", "Canada": "CAN", "Australia": "AUS", "New Zealand": "NZL", "Japan": "JPN",
    "Denmark": "DEN", "Sweden": "SWE", "Norway": "NOR", "Poland": "POL", "Antigua and Barbuda": "ATG",
}

POS = {"GK": "GK", "DF": "DEF", "MF": "MID", "FW": "ATT"}


def fetch_batch(titles):
    ctx = ssl.create_default_context(cafile=os.environ.get("SSL_CERT_FILE") or "/root/.ccr/ca-bundle.crt") if os.path.exists("/root/.ccr/ca-bundle.crt") else ssl.create_default_context()
    out = {}
    for i in range(0, len(titles), 50):
        chunk = titles[i:i + 50]
        body = urllib.parse.urlencode({"action": "query", "prop": "revisions", "rvprop": "content|timestamp", "rvslots": "main",
                                       "titles": "|".join(chunk), "redirects": "1", "format": "json", "formatversion": "2"}).encode()
        for attempt in range(6):
            try:
                req = urllib.request.Request("https://en.wikipedia.org/w/api.php", data=body,
                                             headers={"User-Agent": UA, "Content-Type": "application/x-www-form-urlencoded"})
                data = json.loads(urllib.request.urlopen(req, context=ctx, timeout=60).read().decode())
                break
            except Exception as e:  # noqa: BLE001
                print("retry:", e, file=sys.stderr)
                time.sleep(10 * (attempt + 1))
        else:
            sys.exit("Wikipedia fetch failed")
        q = data["query"]
        back = {r["to"]: r["from"] for r in q.get("redirects", [])}
        norm = {n["to"]: n["from"] for n in q.get("normalized", [])}
        for p in q["pages"]:
            orig = back.get(p["title"], p["title"])
            orig = norm.get(orig, orig)
            if "revisions" in p:
                r = p["revisions"][0]
                out[orig] = {"title": p["title"], "timestamp": r["timestamp"], "wikitext": r["slots"]["main"]["content"]}
        time.sleep(3)
    return out


LINK = re.compile(r"\[\[([^\]|]+)(?:\|([^\]]+))?\]\]")


def strip_markup(s):
    s = LINK.sub(lambda m: m.group(2) or m.group(1), s)
    s = re.sub(r"\{\{(?:nowrap|small|sortname)\|([^{}]*)\}\}", r"\1", s, flags=re.I)
    s = re.sub(r"\{\{[^{}]*\}\}|<[^>]+>|'''?", "", s)
    return re.sub(r"\s+", " ", s).strip()


def templates(text, names):
    """Yield (name, params) for top-level templates whose name matches, with brace matching."""
    pat = re.compile(r"\{\{\s*(" + "|".join(names) + r")\s*\|", re.I)
    for m in pat.finditer(text):
        depth, i = 0, m.start()
        while i < len(text):
            if text.startswith("{{", i):
                depth += 1
                i += 2
            elif text.startswith("}}", i):
                depth -= 1
                i += 2
                if depth == 0:
                    break
            else:
                i += 1
        inner = text[m.end():i - 2]
        params, buf, d2, sq = {}, "", 0, 0
        parts = []
        for ch in inner:
            if ch == "{":
                d2 += 1
            elif ch == "}":
                d2 -= 1
            elif ch == "[":
                sq += 1
            elif ch == "]":
                sq -= 1
            if ch == "|" and d2 == 0 and sq == 0:
                parts.append(buf)
                buf = ""
            else:
                buf += ch
        parts.append(buf)
        for p in parts:
            if "=" in p:
                k, v = p.split("=", 1)
                params[k.strip().lower()] = v.strip()
        yield m.group(1), params, m.start()


def season_clubs(wikitext):
    i = wikitext.find("Stadiums and locations")
    sect = wikitext[i:]
    t = sect.find("{|")
    table = sect[t:sect.find("\n|}", t)]
    clubs = []
    for row in table.split("\n|-")[1:]:
        lines = [l for l in row.strip().split("\n") if l.startswith(("|", "!"))]
        m = LINK.search(lines[0]) if lines else None
        if m:
            clubs.append({"article": m.group(1).strip(), "name": strip_markup(m.group(2) or m.group(1))})
    return clubs


SQUAD_TPL = [r"fs\s*player", r"football\s+squad\s+player", r"fs2\s*player"]


def table_squad(wikitext):
    """Fallback for clubs that list the squad as a plain wikitable (No. | Pos. | Player | Nation)."""
    m = re.search(r"\{\|[^\n]*\n\|\+[^\n]*first-team squad", wikitext, re.I)
    if not m:
        return []
    table = wikitext[m.start():wikitext.find("\n|}", m.start())]
    players = []
    for row in table.split("\n|-")[1:]:
        cells = [c.strip() for c in re.split(r"\n[|!]", "\n" + row.strip()) if c.strip()]
        if len(cells) < 4 or cells[0].startswith("scope"):
            continue
        no = re.sub(r"\D", "", cells[0].split("|")[-1])
        pos = re.search(r"\b(GK|DF|MF|FW)\b", cells[1])
        sn = re.search(r"\{\{sortname\|([^|}]+)\|([^|}]+)", cells[2])
        name = f"{sn.group(1)} {sn.group(2)}" if sn else strip_markup(re.sub(r"\(.*", "", cells[2]))
        nat = re.search(r"\{\{flagu?\|([^|}]+)", cells[3])
        if not pos or not name or "loan to" in cells[2].lower():
            continue
        natv = nat.group(1).strip() if nat else ""
        players.append({"name": name.strip(), "position": POS[pos.group(1)], "nationality": NAT.get(natv, natv[:3].upper() or "—"),
                        "squadNumber": int(no) if no else None, "onLoan": "loan from" in cells[2].lower()})
    return players


def squad(wikitext):
    wikitext = re.sub(r"<!--.*?-->", "", wikitext, flags=re.S)
    players = []
    first = None
    for _name, params, pos in templates(wikitext, SQUAD_TPL):
        if first is None:
            first = pos
            # The first-team block ends at the squad table's end template or the next heading.
            nxt = re.search(r"\n==+[^=\n]+==+|\{\{\s*(?:fs|football squad)\s*end", wikitext[first:], re.I)
            limit = first + nxt.start() if nxt else len(wikitext)
        if pos > limit:
            break
        if "loan to" in params.get("other", "").lower():
            continue  # loaned out — plays elsewhere this season
        name = strip_markup(params.get("name", ""))
        p = POS.get(params.get("pos", "").upper())
        if not name or not p:
            continue
        nat = strip_markup(params.get("nat", ""))
        nat = nat if re.fullmatch(r"[A-Z]{3}", nat) else NAT.get(nat, nat[:3].upper() or "—")
        no = re.sub(r"\D", "", params.get("no", ""))
        players.append({"name": name, "position": p, "nationality": nat, "squadNumber": int(no) if no else None,
                        "onLoan": "loan from" in params.get("other", "").lower()})
    if not players:
        players = table_squad(wikitext)
    colours = {}
    m = re.search(r"\{\{\s*(?:Fs|football squad)\s*start[^}]*\}\}", wikitext, re.I)
    if m:
        bg = re.search(r"bg\s*=\s*#?([0-9A-Fa-f]{6})", m.group(0))
        fg = re.search(r"(?<!b)color\s*=\s*#?([0-9A-Fa-f]{6})", m.group(0))
        if bg:
            colours["primary"] = "#" + bg.group(1).upper()
        if fg:
            colours["secondary"] = "#" + fg.group(1).upper()
    return players, colours


def short_code(name, used):
    if name in SHORT and SHORT[name] not in used:
        return SHORT[name]
    words = [w for w in re.findall(r"[A-Za-z]+", name) if w.upper() not in {"FC", "AFC", "CITY", "TOWN", "UNITED"}] or re.findall(r"[A-Za-z]+", name)
    cands = [words[0][:3].upper()]
    if len(words) > 1:
        cands.append((words[0][:2] + words[1][:1]).upper())
    cands.append((words[0][0] + re.sub(r"[aeiou]", "", words[0][1:].lower())[:2]).upper())
    for c in cands:
        if len(c) == 3 and c not in used:
            return c
    n = 2
    while f"{cands[0][:2]}{n}" in used:
        n += 1
    return f"{cands[0][:2]}{n}"


def main():
    offline = "--offline" in sys.argv
    os.makedirs(os.path.dirname(CACHE), exist_ok=True)
    cache = json.load(open(CACHE)) if os.path.exists(CACHE) else {}
    season_pages = [l[4] for l in LEAGUES]
    if not offline:
        cache.update(fetch_batch([t for t in season_pages if t not in cache]))
    leagues = []
    for code, name, tier, top, page in LEAGUES:
        leagues.append({"code": code, "name": name, "tier": tier, "isTopFlight": top, "source": page, "clubs": season_clubs(cache[page]["wikitext"])})
    articles = [c["article"] for l in leagues for c in l["clubs"]]
    if not offline:
        cache.update(fetch_batch([a for a in articles if a not in cache]))
    json.dump(cache, open(CACHE, "w"))

    used = set()
    for l in leagues:
        for c in l["clubs"]:
            page = cache[c["article"]]
            players, colours = squad(page["wikitext"])
            c["short"] = short_code(c["name"], used)
            used.add(c["short"])
            c["primaryColour"] = colours.get("primary", "#2A2F38")
            c["secondaryColour"] = colours.get("secondary", "#FFFFFF")
            c["revision"] = page["timestamp"]
            c["players"] = players
            print(f"{l['code']:4} {c['short']} {c['name']:28} {len(players):3} players", file=sys.stderr)
    out = {
        "season": SEASON,
        "source": "English Wikipedia, CC BY-SA 4.0 — development data only; see scripts/import_wikipedia.py",
        "generatedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "leagues": leagues,
    }
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    json.dump(out, open(OUT, "w"), indent=1, ensure_ascii=False)
    total = sum(len(c["players"]) for l in leagues for c in l["clubs"])
    print(f"Wrote {OUT}: {sum(len(l['clubs']) for l in leagues)} clubs, {total} players", file=sys.stderr)


if __name__ == "__main__":
    main()
