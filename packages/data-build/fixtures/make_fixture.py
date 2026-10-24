"""Generates a small, SYNTHETIC MTGJSON-shaped fixture (per-set files) for local builds and tests.
Card names and rules texts are real; all ids are fake (uuid5), so Scryfall images will not load.
Run: python3 fixtures/make_fixture.py"""
import json, uuid, os, zlib

NS = uuid.UUID('6f6c7cf0-5b1a-4a43-9a49-7a0b2b7d4b00')
def uid(*p): return str(uuid.uuid5(NS, '|'.join(p)))
LEGAL_ALL = {"commander": "Legal", "legacy": "Legal", "vintage": "Legal", "modern": "Legal"}

def card(set_code, number, name, *, mana=None, mv=0, type_, text=None, colors=(), ident=None, rarity='common',
         pt=None, loyalty=None, keywords=(), de=None, artist='Fixture Artist', flavor=None, layout='normal',
         face=None, side=None, oracle_name=None, legal=LEGAL_ALL, rank=None, promo=False, finishes=('nonfoil', 'foil')):
    oname = oracle_name or name
    c = {
        "uuid": uid('print', set_code, number, side or 'a'), "name": name, "type": type_, "layout": layout,
        "colors": list(colors), "colorIdentity": list(ident if ident is not None else colors), "number": number,
        "rarity": rarity, "artist": artist, "legalities": legal, "finishes": list(finishes), "keywords": list(keywords),
        "manaValue": mv, "setCode": set_code, "availability": ["paper"], "isPromo": promo,
        "identifiers": {"scryfallId": uid('scry', set_code, number), "scryfallOracleId": uid('oracle', oname),
                        "scryfallIllustrationId": uid('art', oname, artist or ''),
                        "mcmId": str(zlib.crc32((set_code + number).encode()) % 900000 + 1000)},
    }
    if mana: c["manaCost"] = mana
    if text: c["text"] = text
    if flavor: c["flavorText"] = flavor
    if pt: c["power"], c["toughness"] = pt
    if loyalty: c["loyalty"] = loyalty
    if face: c["faceName"] = face
    if side: c["side"] = side
    if rank: c["edhrecRank"] = rank
    if de: c["foreignData"] = [{"language": "German", "name": de[0], "type": de[1], "text": de[2], **({"faceName": de[0]} if face else {})}]
    return c

sets = {
  "M10": ("Magic 2010", "2009-07-17", "core", None, [
    card("M10", "146", "Lightning Bolt", mana="{R}", mv=1, type_="Instant", colors="R", rarity="common", rank=12,
         text="Lightning Bolt deals 3 damage to any target.",
         de=("Blitzschlag", "Spontanzauber", "Blitzschlag fügt einem Ziel deiner Wahl 3 Schadenspunkte zu."),
         flavor="The sparkmage shrieked, calling on the rage of the storms of his youth."),
    card("M10", "193", "Llanowar Elves", mana="{G}", mv=1, type_="Creature — Elf Druid", colors="G", pt=("1", "1"), rank=40,
         text="{T}: Add {G}.", de=("Elfen von Llanowar", "Kreatur — Elf, Druide", "{T}: Erzeuge {G}.")),
    card("M10", "157", "Shivan Dragon", mana="{4}{R}{R}", mv=6, type_="Creature — Dragon", colors="R", rarity="rare", pt=("5", "5"),
         keywords=["Flying"], rank=9000, text="Flying (This creature can't be blocked except by creatures with flying or reach.)\n{R}: Shivan Dragon gets +1/+0 until end of turn.",
         de=("Shivanischer Drache", "Kreatur — Drache", "Fliegend\n{R}: Der Shivanische Drache erhält +1/+0 bis zum Ende des Zuges."),
         flavor="The undisputed master of the mountains of Shiv."),
  ]),
  "ISD": ("Innistrad", "2011-09-30", "expansion", None, [
    card("ISD", "51a", "Delver of Secrets // Insectile Aberration", face="Delver of Secrets", side="a", layout="transform",
         mana="{U}", mv=1, type_="Creature — Human Wizard", colors="U", pt=("1", "1"), rank=5000,
         text="At the beginning of your upkeep, look at the top card of your library. You may reveal that card. If an instant or sorcery card is revealed this way, transform Delver of Secrets.",
         de=("Geheimnissucher", "Kreatur — Mensch, Zauberer", "Schau dir zu Beginn deines Versorgungssegments die oberste Karte deiner Bibliothek an.")),
    card("ISD", "51a", "Delver of Secrets // Insectile Aberration", face="Insectile Aberration", side="b", layout="transform",
         mv=1, type_="Creature — Human Insect", colors="U", pt=("3", "2"), keywords=["Flying"], text="Flying"),
    card("ISD", "1", "Avacyn's Pilgrim", mana="{G}", mv=1, type_="Creature — Human Monk", colors="G", ident="GW", pt=("1", "1"),
         text="{T}: Add {W}.", rank=3000, de=("Avacyns Pilgerin", "Kreatur — Mensch, Mönch", "{T}: Erzeuge {W}.")),
  ]),
  "ZEN": ("Zendikar", "2009-10-02", "expansion", None, [
    card("ZEN", "111", "Sorin Markov", mana="{3}{B}{B}{B}", mv=6, type_="Legendary Planeswalker — Sorin", colors="B", rarity="mythic", loyalty="4",
         text="+2: Sorin Markov deals 2 damage to any target and you gain 2 life.\n−3: Target opponent's life total becomes 10.\n−7: You control target player during that player's next turn.",
         rank=8000, de=("Sorin Markov", "Legendärer Planeswalker — Sorin", "+2: Sorin Markov fügt einem Ziel deiner Wahl 2 Schadenspunkte zu und du erhältst 2 Lebenspunkte dazu.")),
  ]),
  "APC": ("Apocalypse", "2001-06-04", "expansion", None, [
    card("APC", "128a", "Fire // Ice", face="Fire", side="a", layout="split", mana="{1}{R}", mv=4, type_="Instant", colors="R", ident="UR", oracle_name="Fire // Ice",
         rarity="uncommon", text="Fire deals 2 damage divided as you choose among one or two targets.", rank=2500),
    card("APC", "128a", "Fire // Ice", face="Ice", side="b", layout="split", mana="{1}{U}", mv=4, type_="Instant", colors="U", ident="UR", oracle_name="Fire // Ice",
         rarity="uncommon", text="Tap target permanent.\nDraw a card."),
  ]),
  "C21": ("Commander 2021", "2021-04-23", "commander", "STX", [
    card("C21", "263", "Sol Ring", mana="{1}", mv=1, type_="Artifact", rarity="uncommon", rank=1,
         text="{T}: Add {C}{C}.", legal={"commander": "Legal", "legacy": "Banned", "vintage": "Restricted"},
         de=("Sol-Ring", "Artefakt", "{T}: Erzeuge {C}{C}.")),
    card("C21", "171", "Lightning Bolt", mana="{R}", mv=1, type_="Instant", colors="R", rarity="uncommon", rank=12,
         text="Lightning Bolt deals 3 damage to any target.", promo=False, artist="Other Artist"),
  ]),
}

os.makedirs(os.path.join(os.path.dirname(__file__), 'mtgjson'), exist_ok=True)
for code, (name, date, typ, parent, cards) in sets.items():
    s = {"code": code, "name": name, "releaseDate": date, "type": typ, "keyruneCode": code, "cards": cards}
    if parent: s["parentCode"] = parent
    with open(os.path.join(os.path.dirname(__file__), 'mtgjson', f'{code}.json'), 'w') as f:
        json.dump({"meta": {"version": "fixture"}, "data": s}, f, ensure_ascii=False, indent=1)
print('ok', sum(len(v[4]) for v in sets.values()), 'card faces')
