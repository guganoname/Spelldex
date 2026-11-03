/**
 * Pokédex-style "dex entry" for a card: size, weight, horsepower, habitat, funny stats and a short
 * background paragraph. Fully deterministic and offline (no AI at runtime): the values come from
 * the card's type line, subtypes, power/toughness, keywords, rules and flavor text, scaled from
 * per-type templates and jittered with a hash of the card's id so every card gets its own stable
 * numbers. These are playful estimates, not canonical lore, and the UI labels them that way.
 */
import type { Color } from '../contracts/card.ts';
import {
  BODIES, COLOR_ADJ, COLOR_HABITAT, COLOR_MOOD, JOBS, LIFESPAN, SNACKS, type Body, type BodyPlan,
} from './tables.ts';
import type { DexEntry, DexInput, DexKind, DexStat, DexUnit, Loc } from './types.ts';

// --- deterministic randomness -----------------------------------------------------------------

function fnv1a(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** One small PRNG stream per stat, so adding a stat never changes the others. */
export function rngFor(seed: string) {
  let a = fnv1a(seed);
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    /** x ± spread (relative). */
    jitter: (x: number, spread = 0.12) => x * (1 + (next() * 2 - 1) * spread),
    between: (lo: number, hi: number) => lo + next() * (hi - lo),
    pick: <T>(arr: readonly T[]): T => arr[Math.floor(next() * arr.length)]!,
  };
}

const sig = (x: number, digits = 3) => {
  if (x === 0 || !Number.isFinite(x)) return 0;
  const p = Math.pow(10, digits - Math.ceil(Math.log10(Math.abs(x))));
  return Math.round(x * p) / p;
};
const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));
const L = (de: string, en: string): Loc => ({ de, en });
const num = (s: string | null | undefined): number | null => (s != null && /^-?\d+(\.\d+)?$/.test(s.trim()) ? Number(s) : null);

const stat = (id: string, label: Loc, value: number, unit: DexUnit): DexStat => ({ id, label, value, unit });
const textStat = (id: string, label: Loc, text: Loc): DexStat => ({ id, label, text });

// --- card parsing -----------------------------------------------------------------------------

interface Parsed {
  types: string[];
  subtypes: string[];
  legendary: boolean;
  text: string;
  flavor: string;
  has: (keyword: string) => boolean;
  color: Color | 'multi' | 'colorless';
  mainColor: Color | 'colorless';
}

/** Keywords on their own line ("Flying, vigilance"), reminder text removed, plus MTGJSON keywords. */
function keywordSet(text: string, keywords: string[]): Set<string> {
  const set = new Set(keywords.map((k) => k.toLowerCase()));
  for (const raw of text.split('\n')) {
    const line = raw.replace(/\([^)]*\)/g, '').trim();
    if (!line || line.includes('.') || line.includes(':')) continue;
    for (const part of line.split(/,\s*|;\s*/)) {
      const k = part.trim().toLowerCase().replace(/\s*\{.*$|\s+\d+$|\s+from\s.*$/, '');
      if (k) set.add(k);
    }
  }
  return set;
}

function parse(c: DexInput): Parsed {
  const [front = '', back = ''] = c.typeLine.split('//')[0]!.split('—').map((s) => s.trim());
  const words = front.split(/\s+/).filter(Boolean);
  const text = c.oracleText ?? '';
  const kws = keywordSet(text, c.keywords);
  const has = (k: string) => kws.has(k) || [...kws].some((x) => x.startsWith(`${k} `));
  const color = c.colors.length === 0 ? 'colorless' : c.colors.length > 1 ? 'multi' : c.colors[0]!;
  return {
    types: words.filter((w) => w !== 'Legendary' && w !== 'Basic' && w !== 'Snow' && w !== 'World'),
    subtypes: back.split(/\s+/).filter(Boolean),
    legendary: words.includes('Legendary'),
    text,
    flavor: c.flavorText ?? '',
    has,
    color,
    mainColor: c.colors[0] ?? 'colorless',
  };
}

function kindOf(p: Parsed): DexKind {
  const t = new Set(p.types);
  if (t.has('Creature')) return 'creature';
  if (p.subtypes.includes('Vehicle') || p.subtypes.includes('Spacecraft')) return 'vehicle';
  if (t.has('Planeswalker')) return 'planeswalker';
  if (t.has('Battle')) return 'battle';
  if (t.has('Land')) return 'land';
  if (p.subtypes.includes('Equipment')) return 'equipment';
  if (t.has('Artifact')) return 'artifact';
  if (t.has('Enchantment')) return 'enchantment';
  return 'spell';
}

/** German name of a subtype: our table, else the same position in the German type line. */
function subtypeDe(c: DexInput, p: Parsed, en: string): string {
  const fromTable = BODIES[en]?.de ?? JOBS[en]?.de;
  if (fromTable) return fromTable;
  const de = c.typeLineDe?.split('//')[0]?.split('—')[1]?.split(/[,\s]+/).filter(Boolean);
  const i = p.subtypes.indexOf(en);
  return de && de.length === p.subtypes.length && i >= 0 ? de[i]! : en;
}

const habitatFor = (base: Loc, plane: Loc | null): Loc =>
  plane ? L(`${base.de} auf ${plane.de}`, `${base.en} on ${plane.en}`) : base;

/** Average of power and toughness, or a guess from the mana value. */
function sizeScore(c: DexInput): number {
  const pw = num(c.power);
  const tg = num(c.toughness);
  if (pw != null && tg != null) return (pw + tg) / 2;
  if (pw != null || tg != null) return (pw ?? tg)!;
  return c.manaValue / 1.5 + 1;
}

// --- shared sentences -------------------------------------------------------------------------

const KEYWORD_LINES: [string, Loc][] = [
  ['flying', L('Sichtungen gelingen fast nur mit Blick nach oben.', 'Usually sighted by looking up.')],
  ['deathtouch', L('Ein einziger Kratzer genügt. Abstand halten!', 'A single scratch is enough. Keep your distance!')],
  ['haste', L('Greift an, bevor jemand reagieren kann.', 'Strikes before anyone can react.')],
  ['indestructible', L('Gilt als unzerstörbar. Versuche laufen noch.', 'Considered indestructible. Attempts are ongoing.')],
  ['trample', L('Bleibt für nichts und niemanden stehen.', 'Does not stop for anything in its path.')],
  ['lifelink', L('Jeder Treffer heilt die eigenen Wunden.', 'Every blow it lands heals its own wounds.')],
  ['vigilance', L('Schläft nie ganz und hält immer Wache.', 'Never fully sleeps and is always on watch.')],
  ['double strike', L('Schlägt zweimal zu, bevor andere einmal ausholen.', 'Strikes twice before others swing once.')],
  ['first strike', L('Schlägt immer zuerst zu.', 'Always strikes first.')],
  ['menace', L('Erst zu zweit hat man eine Chance, es aufzuhalten.', 'It takes at least two to stop it.')],
  ['hexproof', L('Zauber gleiten einfach ab.', 'Spells simply slide off.')],
  ['ward', L('Wer es verzaubern will, zahlt drauf.', 'Enchanting it comes at a price.')],
  ['flash', L('Taucht wie aus dem Nichts auf.', 'Appears out of nowhere.')],
  ['reach', L('Pflückt Flieger einfach aus der Luft.', 'Snatches fliers right out of the air.')],
  ['defender', L('Bewegt sich ungern vom Fleck.', 'Hates leaving its spot.')],
  ['prowess', L('Wird mit jedem Zauber munterer.', 'Gets livelier with every spell.')],
  ['undying', L('Kommt einfach immer wieder zurück.', 'Simply keeps coming back.')],
  ['persist', L('Kommt einfach immer wieder zurück.', 'Simply keeps coming back.')],
  ['living metal', L('Verwandelt sich auf Wunsch in etwas ganz anderes.', 'Transforms into something else entirely on request.')],
];

const THEMES: [RegExp, Loc][] = [
  [/\b(fire|flame|burn|blaze|ember|inferno)/i, L('Hinterlässt gern verbrannte Erde.', 'Tends to leave scorched earth behind.')],
  [/\b(ice|frost|snow|cold|freez)/i, L('Bringt eisige Luft mit, egal zu welcher Jahreszeit.', 'Brings an icy chill in any season.')],
  [/\b(sea|ocean|wave|tide|deep|water)/i, L('Riecht immer ein wenig nach Salzwasser.', 'Always smells faintly of salt water.')],
  [/\b(night|moon|dark|shadow)/i, L('Wird vor allem nach Sonnenuntergang aktiv.', 'Most active after sunset.')],
  [/\b(storm|lightning|thunder)/i, L('Kündigt sich oft mit Donnergrollen an.', 'Often announced by a rumble of thunder.')],
  [/\b(gold|treasure|coin|wealth)/i, L('Hat eine Schwäche für alles, was glänzt.', 'Has a weakness for anything shiny.')],
  [/\b(song|sing|music|melod)/i, L('Summt bei der Arbeit leise vor sich hin.', 'Hums quietly while it works.')],
  [/\b(hunger|hungry|feast|devour|eat)/i, L('Ist eigentlich immer hungrig.', 'Is basically always hungry.')],
  [/\b(dream|sleep)/i, L('Taucht gern in fremden Träumen auf.', "Likes to show up in other people's dreams.")],
  [/\b(war|battle|army|legion)/i, L('Kennt das Schlachtfeld besser als das eigene Bett.', 'Knows the battlefield better than its own bed.')],
];

function sentences(p: Parsed, max: number): Loc[] {
  const out: Loc[] = [];
  for (const [k, line] of KEYWORD_LINES) {
    if (out.length >= max) break;
    if (p.has(k) && !out.includes(line)) out.push(line);
  }
  const theme = THEMES.find(([re]) => re.test(p.flavor) || re.test(p.text));
  if (theme) out.push(theme[1]);
  return out;
}

function rarityLine(c: DexInput, p: Parsed): Loc {
  if (p.legendary) return L('Es gibt nur ein einziges bekanntes Exemplar.', 'Only one specimen is known to exist.');
  if (c.rarity === 'mythic') return L('Eine Sichtung gilt als Glücksfall.', 'A sighting counts as a stroke of luck.');
  if (c.rarity === 'rare') return L('Selten, aber nicht unmöglich zu finden.', 'Rare, but not impossible to find.');
  return L('Kommt häufig vor, wird aber gern übersehen.', 'Common, yet often overlooked.');
}

function join(...parts: (Loc | null)[]): Loc {
  const ps = parts.filter((x): x is Loc => x != null);
  return L(ps.map((x) => x.de).join(' '), ps.map((x) => x.en).join(' '));
}

function compareSize(heightM: number, weightKg: number): Loc | null {
  const de = (x: number) => Math.round(x).toLocaleString('de-DE');
  const en = (x: number) => Math.round(x).toLocaleString('en-GB');
  if (weightKg >= 2400) return L(`Wiegt so viel wie etwa ${de(weightKg / 600)} Kühe.`, `Weighs about as much as ${en(weightKg / 600)} cows.`);
  if (heightM >= 4) return L(`Ist rund ${de(heightM / 1.75)}-mal so groß wie ein Mensch.`, `Stands about ${en(heightM / 1.75)} times as tall as a human.`);
  if (weightKg > 0 && weightKg < 0.1) return L('Wiegt weniger als ein Brief.', 'Weighs less than a letter.');
  if (heightM <= 0.3) return L('Passt bequem in eine Teetasse.', 'Fits comfortably in a teacup.');
  return null;
}

const sightingChance = (c: DexInput, p: Parsed) =>
  p.legendary ? 0.5 : ({ common: 62, uncommon: 24, rare: 7, mythic: 1.5 } as Record<string, number>)[c.rarity] ?? 10;

// --- creatures --------------------------------------------------------------------------------

const AGE: Record<string, number> = {
  Elf: 700, Dwarf: 250, Vampire: 900, Goblin: 12, Human: 80, Kor: 90, Vedalken: 160, Kithkin: 60,
  Orc: 45, Halfling: 110, Gnome: 300, Merfolk: 120, Lich: 2000, Sphinx: 6000, Angel: 1500, Demon: 4000,
};

const CUDDLY = new Set(['Cat', 'Dog', 'Fox', 'Rabbit', 'Squirrel', 'Otter', 'Raccoon', 'Mouse', 'Bird', 'Faerie', 'Frog', 'Monkey', 'Unicorn', 'Pegasus', 'Bear', 'Kithkin', 'Halfling']);

const MATERIALS: Loc[] = [
  L('Messing und Mana-Kristall', 'Brass and mana crystal'), L('Schwarzstahl', 'Blackened steel'),
  L('Darksteel', 'Darksteel'), L('Bronze mit Zahnrädern', 'Clockwork bronze'), L('Uralter Stein', 'Ancient stone'),
];

const BREATH: Record<Color | 'colorless', [Loc, number]> = {
  R: [L('Feueratem', 'Fire breath'), 1400],
  U: [L('Frostatem', 'Frost breath'), -90],
  B: [L('Säureatem', 'Acid breath'), 320],
  G: [L('Giftatem', 'Poison breath'), 60],
  W: [L('Lichtatem', 'Radiant breath'), 5800],
  colorless: [L('Ätheratem', 'Aether breath'), 0],
};

const CORE_TEMP: Record<Color | 'colorless', number> = { R: 1200, U: 4, B: -12, G: 26, W: 37, colorless: 400 };

const BASE_SPEED: Record<BodyPlan, number> = {
  dragon: 90, winged: 50, humanoid: 18, giant: 28, undead: 6, spirit: 30, beast: 45, bird: 40, aquatic: 25,
  serpent: 14, insect: 22, construct: 16, elemental: 35, plant: 0.6, ooze: 0.3, eldrazi: 12, horror: 32, divine: 80, tiny: 25,
};

const GENERIC_BEING: Body = { de: 'Wesen', en: 'Being', plan: 'humanoid', h: 1.8, kg: 80, ref: 2 };

function creature(c: DexInput, p: Parsed): DexEntry {
  const matched = p.subtypes.map((s) => [s, BODIES[s]] as const).filter((x): x is readonly [string, Body] => x[1] != null);
  const isArtifact = p.types.includes('Artifact');
  const [bodyKey, body] = matched.length
    ? [...matched].sort((a, b) => b[1].kg - a[1].kg)[0]!
    : isArtifact ? (['Construct', BODIES.Construct!] as const) : (['', GENERIC_BEING] as const);
  const plans = new Set(matched.map(([, x]) => x.plan));
  const ghostly = plans.has('spirit') && body.plan !== 'spirit';
  const undead = plans.has('undead') || body.plan === 'undead';
  const job = p.subtypes.map((s) => JOBS[s]).find((j) => j != null) ?? null;
  const r = (id: string) => rngFor(`${c.seed}|${id}`);

  const s = sizeScore(c);
  const scale = clamp(Math.pow(1.2, s - body.ref), 0.2, 12);
  const height = sig(r('h').jitter(body.h * scale));
  let weight = sig(r('kg').jitter(body.kg * scale ** 3, 0.18));
  if (body.plan === 'spirit' || ghostly) weight = sig(r('kg').between(0.015, 0.03));
  if (bodyKey === 'Illusion') weight = 0;

  const specs: DexStat[] = [
    stat('height', body.long ? L('Länge', 'Length') : L('Größe', 'Height'), height, 'm'),
    stat('weight', L('Gewicht', 'Weight'), weight, 'kg'),
  ];

  const flying = p.has('flying');
  if (flying && (body.plan === 'dragon' || body.plan === 'winged' || body.plan === 'bird')) {
    const span = body.plan === 'dragon' ? height * 1.15 : body.plan === 'bird' ? height * 2.4 : height * 1.8;
    specs.push(stat('wingspan', L('Spannweite', 'Wingspan'), sig(r('span').jitter(span)), 'm'));
  }
  if (flying) specs.push(stat('ceiling', L('Flughöhe', 'Flight ceiling'), sig(r('ceil').jitter(clamp(300 * Math.pow(1.45, s), 50, 12000))), 'm'));

  const aquatic = body.plan === 'aquatic' || /walk|Island/.test(p.text) && body.plan === 'serpent';
  let speed = BASE_SPEED[body.plan] * (flying && body.plan !== 'dragon' ? 1.8 : 1) * (p.has('haste') ? 1.6 : 1) * (1 + s * 0.04);
  if (bodyKey === 'Skeleton') speed = 12;
  specs.push(stat('speed', aquatic ? L('Schwimmtempo', 'Swim speed') : flying ? L('Fluggeschwindigkeit', 'Flight speed') : L('Höchsttempo', 'Top speed'), sig(r('speed').jitter(speed, 0.15), 2), 'kmh'));

  if (body.plan === 'dragon') {
    const [label, t] = BREATH[p.mainColor];
    specs.push(stat('breath', label, sig(r('breath').jitter(t, 0.1)), 'celsius'));
  }
  if (aquatic) specs.push(stat('depth', L('Tauchtiefe', 'Dive depth'), sig(r('depth').jitter(80 * Math.pow(1.6, s))), 'm'));
  if (body.plan === 'elemental') specs.push(stat('core', L('Kerntemperatur', 'Core temperature'), sig(r('core').jitter(CORE_TEMP[p.mainColor], 0.15)), 'celsius'));
  if (body.plan === 'beast' || body.plan === 'giant') specs.push(stat('bite', body.plan === 'giant' ? L('Schlagkraft', 'Punch force') : L('Beißkraft', 'Bite force'), sig(r('bite').jitter(900 * scale ** 2 * (body.kg / 100) ** 0.5)), 'newton'));
  if (body.plan === 'insect') specs.push(stat('legs', L('Beine', 'Legs'), ['Spider', 'Scorpion'].includes(bodyKey) ? 8 : 6, 'count'));
  if (bodyKey === 'Hydra') specs.push(stat('heads', L('Köpfe', 'Heads'), clamp(Math.round(s + r('heads').between(0, 3)), 3, 12), 'count'));
  if (body.plan === 'construct') {
    const kw = sig(r('kw').jitter(12 * Math.pow(1.9, s)));
    specs.push(bodyKey === 'Robot'
      ? stat('horsepower', L('Leistung', 'Power output'), sig(kw * 1.36), 'hp')
      : stat('power', L('Leistung', 'Power output'), kw, 'kw'));
    specs.push(textStat('material', L('Material', 'Material'), r('mat').pick(MATERIALS)));
  }
  if (undead) specs.push(stat('deceased', L('Verstorben seit', 'Deceased for'), Math.round(r('dead').between(3, 600)), 'years'));
  else if (body.plan === 'plant') specs.push(stat('age', L('Alter', 'Age'), sig(r('age').jitter(LIFESPAN.plant * (p.legendary ? 2 : 0.5), 0.5)), 'years'));
  else if (body.plan !== 'construct' && body.plan !== 'eldrazi' && body.plan !== 'spirit') {
    const life = AGE[bodyKey] ?? LIFESPAN[body.plan];
    specs.push(stat('age', L('Alter', 'Age'), Math.max(1, Math.round(life * r('age').between(0.2, p.legendary ? 0.9 : 0.6))), 'years'));
  }
  if (body.plan === 'spirit' || ghostly) specs.push(stat('transparency', L('Durchsichtigkeit', 'Transparency'), Math.round(r('see').between(55, 96)), 'percent'));
  if (job) specs.push(textStat('job', L('Beruf', 'Occupation'), job));

  const pw = num(c.power) ?? s;
  const danger = clamp(Math.round(pw * 1.2 + (p.has('deathtouch') ? 3 : 0) + (p.has('double strike') ? 2 : p.has('first strike') ? 1 : 0) + (p.has('menace') || p.has('trample') ? 1 : 0) + (body.plan === 'eldrazi' ? 4 : 0)), 1, 10);
  const cuddly = clamp(Math.round(9 - danger * 0.7 + (CUDDLY.has(bodyKey) ? 3 : 0) - (['horror', 'eldrazi', 'ooze', 'insect', 'undead'].includes(body.plan) ? 4 : 0) - (p.has('deathtouch') ? 3 : 0)), 0, 10);
  const sleep = p.has('vigilance') || undead || body.plan === 'construct' ? 0 : bodyKey === 'Cat' ? 16 : Math.round(r('sleep').between(5, 11));
  const funny: DexStat[] = [
    stat('danger', L('Gefahrenstufe', 'Danger level'), danger, 'rating10'),
    stat('cuddle', L('Kuschelfaktor', 'Cuddle factor'), cuddly, 'rating10'),
    textStat('snack', L('Lieblingssnack', 'Favourite snack'), r('snack').pick(SNACKS[body.plan])),
    textStat('mood', L('Gemüt', 'Temperament'), r('mood').pick(COLOR_MOOD[p.mainColor])),
    stat('sleep', L('Schlaf pro Tag', 'Sleep per day'), sleep, 'hours'),
    stat('sighting', L('Sichtungschance', 'Sighting chance'), sightingChance(c, p), 'percent'),
  ];
  if (/More Than Meets the Eye|Living metal/i.test(p.text)) funny.push(stat('transform', L('Verwandlungszeit', 'Transform time'), sig(r('tf').between(0.8, 3.5), 2), 'seconds'));

  const adj = p.color === 'colorless' && !isArtifact ? L('Leeren', 'Void') : COLOR_ADJ[p.color];
  const bodyDe = bodyKey ? subtypeDe(c, p, bodyKey) : body.de;
  const bodyEn = bodyKey || body.en;
  const category = L(`${adj.de}-${bodyDe}`, `${adj.en} ${bodyEn}`);
  const base = body.plan === 'aquatic' ? L('Küsten und Tiefsee', 'Coasts and the deep sea')
    : body.plan === 'eldrazi' ? L('Die Blinde Ewigkeit zwischen den Ebenen', 'The Blind Eternities between planes')
    : COLOR_HABITAT[p.mainColor];
  const habitat = body.plan === 'eldrazi' ? base : habitatFor(base, c.plane);
  const intro = job
    ? L(`${c.name}, ${category.de}, arbeitet als ${job.de}.`, `${c.name}, a ${category.en}, works as a ${job.en.toLowerCase()}.`)
    : L(`${c.name} gehört zur Art ${category.de}.`, `${c.name} is a ${category.en}.`);
  return {
    kind: 'creature', category, habitat, specs, funny,
    entry: join(intro, ...sentences(p, 2), compareSize(height, weight), rarityLine(c, p)),
  };
}

// --- vehicles ---------------------------------------------------------------------------------

type VehicleMode = 'racer' | 'land' | 'ship' | 'air' | 'space' | 'mech' | 'rail';
const VEHICLE_NAME: Record<VehicleMode, Loc> = {
  racer: L('Rennwagen', 'Racer'), land: L('Fahrzeug', 'Vehicle'), ship: L('Schiff', 'Ship'),
  air: L('Luftschiff', 'Airship'), space: L('Raumschiff', 'Spacecraft'), mech: L('Kampfläufer', 'Walker'), rail: L('Zug', 'Train'),
};
const VEHICLE_HABITAT: Record<VehicleMode, Loc> = {
  racer: L('Rennstrecken und staubige Pisten', 'Race tracks and dusty roads'),
  land: L('Straßen und Schlachtfelder', 'Roads and battlefields'),
  ship: L('Die hohe See', 'The open sea'),
  air: L('Wolkenstraßen', 'Cloud lanes'),
  space: L('Der Raum zwischen den Sternen', 'The space between the stars'),
  mech: L('Schlachtfelder und Baustellen', 'Battlefields and building sites'),
  rail: L('Schienen quer durchs Land', 'Rails across the land'),
};

function vehicleMode(c: DexInput, p: Parsed): VehicleMode {
  const n = c.name;
  if (p.subtypes.includes('Spacecraft') || /spacecraft|starship|shuttle|star\b/i.test(n)) return 'space';
  if (/racer|racing|speed|dragster|kart|rally|hot ?rod/i.test(n)) return 'racer';
  if (/train|express|locomotive|railway|rail/i.test(n)) return 'rail';
  if (p.has('flying')) return 'air';
  if (/ship|galleon|skiff|boat|barge|frigate|schooner|dreadnought|\bark\b|sloop|corsair|vessel|ferry|cutter|raft|junk/i.test(n) || p.has('islandwalk')) return 'ship';
  if (/mech|walker|colossus|automaton|juggernaut|titan|strider/i.test(n)) return 'mech';
  return 'land';
}

function vehicle(c: DexInput, p: Parsed): DexEntry {
  const r = (id: string) => rngFor(`${c.seed}|${id}`);
  const mode = vehicleMode(c, p);
  const pw = num(c.power) ?? Math.max(1, c.manaValue);
  const tg = num(c.toughness) ?? Math.max(1, c.manaValue);
  const crew = /Crew (\d+)/i.exec(p.text);
  const pilot = /Pilot (\d+)/i.exec(p.text);
  const haste = p.has('haste') || mode === 'racer';
  const hp = sig(r('hp').jitter(90 * Math.pow(1.55, pw) * (mode === 'racer' ? 1.6 : 1) * (mode === 'ship' || mode === 'rail' ? 3 : 1)));
  const specs: DexStat[] = [stat('horsepower', L('Leistung', 'Power'), hp, 'hp')];

  const v = r('speed').jitter((60 + 22 * pw) * (haste ? 1.35 : 1));
  if (mode === 'ship') specs.push(stat('speed', L('Höchstgeschwindigkeit', 'Top speed'), sig(v / 8, 2), 'knots'));
  else if (mode === 'space') specs.push(stat('speed', L('Reisegeschwindigkeit', 'Cruising speed'), sig(v * 400), 'kmh'));
  else specs.push(stat('speed', L('Höchstgeschwindigkeit', 'Top speed'), sig(mode === 'mech' ? v / 3 : v, 2), 'kmh'));

  if (mode === 'racer' || mode === 'land' || mode === 'rail') {
    specs.push(stat('accel', L('0 auf 100 km/h', '0 to 100 km/h'), sig(clamp(r('acc').jitter(14 - 1.5 * pw - (haste ? 3 : 0)), 1.9, 30), 2), 'seconds'));
  }
  const mult = { racer: 0.5, land: 1, ship: 40, air: 6, space: 60, mech: 4, rail: 30 }[mode];
  specs.push(stat('weight', L('Leergewicht', 'Curb weight'), sig(r('kg').jitter(700 * Math.pow(1.45, tg) * mult)), 'kg'));
  specs.push(stat('length', L('Länge', 'Length'), sig(r('len').jitter(4.5 * Math.pow(1.12, tg) * Math.cbrt(mult))), 'm'));
  if (mode === 'air') specs.push(stat('ceiling', L('Flughöhe', 'Service ceiling'), sig(r('ceil').jitter(1500 * Math.pow(1.3, pw))), 'm'));
  if (mode === 'ship') specs.push(stat('draft', L('Tiefgang', 'Draft'), sig(r('draft').jitter(1.5 + tg * 0.7)), 'm'));
  if (crew) specs.push(stat('crew', L('Besatzung (Crew)', 'Crew'), Number(crew[1]), 'count'));
  else if (pilot) specs.push(stat('crew', L('Pilot', 'Pilot'), Number(pilot[1]), 'count'));
  else specs.push(textStat('crew', L('Besatzung', 'Crew'), L('Fährt von selbst', 'Drives itself')));

  const funny: DexStat[] = [
    stat('fuel', L('Verbrauch pro 100 km', 'Consumption per 100 km'), sig(Math.max(0.5, c.manaValue * r('fuel').between(0.8, 1.6)), 2), 'mana'),
    stat('trunk', L('Kofferraum', 'Boot space'), Math.round(r('trunk').between(40, 600) * Math.cbrt(mult)), 'liters'),
    stat('horn', L('Hupe', 'Horn'), Math.round(r('horn').between(95, 135)), 'db'),
    stat('parking', L('Parkplatzbedarf', 'Parking spaces needed'), Math.max(1, Math.round(mult * r('park').between(0.6, 1.4))), 'count'),
    stat('danger', L('Gefahrenstufe', 'Danger level'), clamp(Math.round(pw * 1.2 + (p.has('trample') ? 1 : 0)), 1, 10), 'rating10'),
  ];
  if (/Living metal|More Than Meets the Eye/i.test(p.text)) funny.push(stat('transform', L('Verwandlungszeit', 'Transform time'), sig(r('tf').between(0.8, 3.5), 2), 'seconds'));

  const name = VEHICLE_NAME[mode];
  const adj = COLOR_ADJ[p.color];
  const category = L(`${adj.de}-${name.de}`, `${adj.en} ${name.en}`);
  const intro = L(`${c.name}: ${category.de} mit ${Math.round(hp)} PS unter der Haube.`, `${c.name}: a ${category.en} with ${Math.round(hp)} hp under the hood.`);
  return {
    kind: 'vehicle', category, habitat: habitatFor(VEHICLE_HABITAT[mode], c.plane), specs, funny,
    entry: join(intro, ...sentences(p, 2), rarityLine(c, p)),
  };
}

// --- non-creatures ----------------------------------------------------------------------------

const SCHOOL: Record<Color | 'colorless', Loc> = {
  W: L('Schutzmagie', 'Warding magic'), U: L('Gedankenmagie', 'Mind magic'), B: L('Nekromantie', 'Necromancy'),
  R: L('Feuermagie', 'Fire magic'), G: L('Naturmagie', 'Nature magic'), colorless: L('Leerenmagie', 'Void magic'),
};
const LOUDNESS: Record<Color | 'colorless', number> = { W: 70, U: 25, B: 40, R: 115, G: 80, colorless: 55 };
const BRIGHTNESS: Record<Color | 'colorless', number> = { W: 12000, U: 900, B: 15, R: 6000, G: 1500, colorless: 300 };

const EFFECTS: [RegExp, Loc][] = [
  [/counter target/i, L('Lässt fremde Zauber einfach verpuffen.', 'Makes other spells simply fizzle.')],
  [/destroy all|each creature|all creatures/i, L('Räumt das Schlachtfeld gründlich auf.', 'Gives the battlefield a thorough clean-up.')],
  [/damage/i, L('Brennt ein Loch in jede Verteidigung.', 'Burns a hole through any defence.')],
  [/destroy/i, L('Hinterlässt nur Staub.', 'Leaves nothing but dust.')],
  [/exile/i, L('Schickt Dinge an einen Ort, von dem kaum etwas zurückkehrt.', 'Sends things somewhere few ever return from.')],
  [/draw/i, L('Füllt den Kopf mit neuem Wissen.', 'Fills the mind with fresh knowledge.')],
  [/create .* token/i, L('Ruft Verstärkung herbei.', 'Calls in reinforcements.')],
  [/search your library/i, L('Findet genau, was gesucht wird.', 'Finds exactly what was looked for.')],
  [/gain .* life/i, L('Wirkt wie eine warme Suppe an einem kalten Tag.', 'Works like warm soup on a cold day.')],
  [/return .* from .* graveyard/i, L('Holt Verlorenes zurück.', 'Brings back what was lost.')],
  [/\+\d+\/\+\d+/i, L('Macht Verbündete über sich hinauswachsen.', 'Makes allies outgrow themselves.')],
];
const SIDE_EFFECTS: Loc[] = [
  L('Leichter Schwefelgeruch', 'Faint smell of sulphur'), L('Kribbeln in den Fingern', 'Tingling fingers'),
  L('Kurzzeitig violette Haare', 'Briefly purple hair'), L('Schluckauf', 'Hiccups'), L('Keine bekannt', 'None known'),
];

function spell(c: DexInput, p: Parsed, kind: DexKind): DexEntry {
  const r = (id: string) => rngFor(`${c.seed}|${id}`);
  const instant = p.types.includes('Instant');
  const mv = c.manaValue;
  const mass = /\b(each|all)\b/i.test(p.text);
  const dmg = /deals? (\d+) damage/i.exec(p.text);
  const specs: DexStat[] = [
    stat('cast', L('Zauberdauer', 'Casting time'), sig(instant ? r('cast').between(0.3, 1.5) : r('cast').between(3, 12) * Math.max(1, mv), 2), 'seconds'),
    stat('mana', L('Manaverbrauch', 'Mana cost'), mv, 'mana'),
    stat('radius', L('Wirkradius', 'Area of effect'), sig(mass ? r('rad').jitter(120 * (1 + mv)) : r('rad').jitter(2 + mv * 1.5)), 'm'),
  ];
  if (dmg) specs.push(stat('damage', L('Schaden', 'Damage'), Number(dmg[1]), 'count'));
  specs.push(stat('loudness', L('Lautstärke', 'Loudness'), Math.round(r('db').jitter(LOUDNESS[p.mainColor] + mv * 3, 0.1)), 'db'));
  specs.push(stat('glow', L('Leuchtkraft', 'Brightness'), sig(r('lm').jitter(BRIGHTNESS[p.mainColor] * (1 + mv / 3), 0.25)), 'lumen'));

  const funny: DexStat[] = [
    stat('curse', L('Fluchwahrscheinlichkeit beim Gegner', 'Chance the opponent swears'), Math.round(clamp(r('curse').between(20, 60) + mv * 6, 5, 99)), 'percent'),
    stat('fail', L('Misslingt bei Anfängern', 'Fails for beginners'), Math.round(r('fail').between(2, 12) * (1 + mv / 4)), 'percent'),
    textStat('side', L('Nebenwirkungen', 'Side effects'), r('side').pick(SIDE_EFFECTS)),
  ];

  const school = SCHOOL[p.mainColor];
  const typeName = instant ? L('Spontanzauber', 'Instant') : p.types.includes('Sorcery') ? L('Hexerei', 'Sorcery') : L('Zauber', 'Spell');
  const category = L(`${school.de} · ${typeName.de}`, `${school.en} · ${typeName.en}`);
  const effect = EFFECTS.find(([re]) => re.test(p.text))?.[1] ?? L('Die genaue Wirkung steht auf der Karte.', 'The exact effect is written on the card.');
  return {
    kind, category, habitat: L('Zauberbücher und Schriftrollen', 'Spellbooks and scrolls'), specs, funny,
    entry: join(L(`${c.name}: ${category.de}.`, `${c.name}: ${category.en}.`), effect, ...sentences(p, 1)),
  };
}

function enchantment(c: DexInput, p: Parsed): DexEntry {
  const base = spell(c, p, 'enchantment');
  const r = (id: string) => rngFor(`${c.seed}|${id}`);
  const chapters = p.subtypes.includes('Saga') ? (p.text.match(/^[IVX]+(, [IVX]+)* —/gm) ?? []).length : 0;
  const specs: DexStat[] = [
    stat('mana', L('Manaverbrauch', 'Mana cost'), c.manaValue, 'mana'),
    stat('aura', L('Ausstrahlung', 'Radius of influence'), sig(r('rad').jitter(p.subtypes.includes('Aura') ? 1.5 : 40 * (1 + c.manaValue))), 'm'),
    stat('duration', L('Haltbarkeit', 'Shelf life'), sig(r('dur').jitter(50 * Math.pow(2, c.manaValue))), 'years'),
    stat('glow', L('Leuchtkraft', 'Brightness'), sig(r('lm').jitter(BRIGHTNESS[p.mainColor], 0.25)), 'lumen'),
  ];
  if (chapters) specs.push(stat('chapters', L('Kapitel', 'Chapters'), chapters, 'count'));
  const funny: DexStat[] = [
    stat('clingy', L('Anhänglichkeit', 'Clinginess'), clamp(Math.round(r('cling').between(3, 10)), 0, 10), 'rating10'),
    base.funny[2]!,
  ];
  const typeName = p.subtypes.includes('Aura') ? L('Aura', 'Aura') : chapters ? L('Saga', 'Saga') : L('Verzauberung', 'Enchantment');
  const school = SCHOOL[p.mainColor];
  const category = L(`${school.de} · ${typeName.de}`, `${school.en} · ${typeName.en}`);
  return { ...base, kind: 'enchantment', category, specs, funny, habitat: habitatFor(L('Verwunschene Orte', 'Enchanted places'), c.plane) };
}

const WEAPON = /sword|blade|axe|spear|bow|hammer|dagger|lance|mace|scimitar|katana|glaive|sab(?:er|re)|whip|staff|knife|cleaver|scythe|flail|maul|pike|trident|claw|fang/i;

function equipment(c: DexInput, p: Parsed, isEquip: boolean): DexEntry {
  const r = (id: string) => rngFor(`${c.seed}|${id}`);
  const mv = Math.max(1, c.manaValue);
  const weapon = isEquip && WEAPON.test(c.name);
  const equip = /Equip(?: [^{\n]*)? \{(\d+)\}|Equip (\d+)/.exec(p.text);
  const bonus = /gets ([+-]\d+\/[+-]\d+)/.exec(p.text);
  const specs: DexStat[] = [
    stat('weight', L('Gewicht', 'Weight'), sig(r('kg').jitter(isEquip ? 1.2 * mv : 0.4 * Math.pow(2.2, mv), 0.3)), 'kg'),
  ];
  if (weapon) specs.push(stat('length', L('Länge', 'Length'), sig(r('len').jitter(0.7 + 0.15 * mv)), 'm'));
  else if (!isEquip) specs.push(stat('size', L('Größe', 'Size'), sig(r('size').jitter(0.15 * Math.pow(1.5, mv), 0.3)), 'm'));
  if (bonus) specs.push(textStat('bonus', L('Kampfwertsteigerung', 'Combat bonus'), L(bonus[1]!, bonus[1]!)));
  if (equip) specs.push(stat('equip', L('Ausrüstkosten', 'Equip cost'), Number(equip[1] ?? equip[2]), 'mana'));
  specs.push(textStat('material', L('Material', 'Material'), r('mat').pick(MATERIALS)));
  specs.push(stat('age', L('Alter', 'Age'), Math.round(r('age').between(10, p.legendary ? 5000 : 600)), 'years'));
  specs.push(stat('charge', L('Magische Ladung', 'Magical charge'), sig(r('charge').jitter(mv * 12)), 'mana'));

  const shine = clamp(Math.round(({ common: 3, uncommon: 5, rare: 7, mythic: 9 } as Record<string, number>)[c.rarity] ?? 5) + (p.legendary ? 1 : 0), 0, 10);
  const funny: DexStat[] = [
    stat('shine', L('Glanzfaktor', 'Shine factor'), shine, 'rating10'),
    stat('lost', L('Wie oft schon verlegt', 'Times misplaced'), Math.round(r('lost').between(0, 40)), 'count'),
    stat('manual', L('Verständlichkeit der Anleitung', 'Manual readability'), Math.round(r('man').between(3, 80)), 'percent'),
    stat('value', L('Schätzwert', 'Estimated value'), sig(r('val').jitter(25 * Math.pow(3, mv) * shine)), 'count'),
  ];
  funny[3]!.label = L('Schätzwert in Goldmünzen', 'Estimated value in gold coins');

  const adj = COLOR_ADJ[p.color];
  const noun = isEquip ? (weapon ? L('Waffe', 'Weapon') : L('Ausrüstung', 'Gear')) : L('Artefakt', 'Artifact');
  const category = L(`${adj.de}-${noun.de}`, `${adj.en} ${noun.en}`);
  return {
    kind: isEquip ? 'equipment' : 'artifact', category,
    habitat: habitatFor(isEquip ? L('Waffenkammern und Schlachtfelder', 'Armouries and battlefields') : COLOR_HABITAT.colorless, c.plane),
    specs, funny,
    entry: join(L(`${c.name}: ${category.de}.`, `${c.name}: ${category.en}.`), ...sentences(p, 1), rarityLine(c, p)),
  };
}

function planeswalker(c: DexInput, p: Parsed): DexEntry {
  const r = (id: string) => rngFor(`${c.seed}|${id}`);
  const loyalty = num(c.loyalty) ?? 3;
  const body = p.subtypes.map((s) => BODIES[s]).find((x) => x != null);
  const h = body ? body.h : 1.78;
  const specs: DexStat[] = [
    stat('height', L('Größe', 'Height'), sig(r('h').jitter(h, 0.08)), 'm'),
    stat('age', L('Alter', 'Age'), Math.round(r('age').between(22, 90) * (r('old').next() < 0.3 ? 40 : 1)), 'years'),
    stat('spark', L('Funkenstärke', 'Spark strength'), clamp(Math.round(loyalty * 1.5 + c.manaValue * 0.5), 1, 10), 'rating10'),
    stat('walks', L('Ebenenwechsel pro Jahr', 'Planeswalks per year'), Math.round(r('walks').between(2, 60)), 'count'),
    textStat('home', L('Heimatebene', 'Home plane'), c.plane ?? L('Unbekannt', 'Unknown')),
  ];
  const funny: DexStat[] = [
    stat('enemies', L('Bekannte Erzfeinde', 'Known nemeses'), Math.round(r('foes').between(1, 9)), 'count'),
    stat('cloak', L('Umhangqualität', 'Cloak quality'), Math.round(r('cloak').between(4, 10)), 'rating10'),
    stat('late', L('Kommt zu spät zu Treffen', 'Late to meetings'), Math.round(r('late').between(5, 95)), 'percent'),
    textStat('mood', L('Gemüt', 'Temperament'), r('mood').pick(COLOR_MOOD[p.mainColor])),
  ];
  const adj = COLOR_ADJ[p.color];
  const category = L(`${adj.de}-Weltenwanderer`, `${adj.en} Planeswalker`);
  return {
    kind: 'planeswalker', category, habitat: L('Überall im Multiversum', 'Anywhere in the Multiverse'), specs, funny,
    entry: join(L(`${c.name}: ${category.de}.`, `${c.name}: ${category.en}.`), L('Reist mit einem Gedanken von Welt zu Welt.', 'Travels from world to world with a single thought.'), rarityLine(c, p)),
  };
}

const TERRAIN: Record<string, { de: string; en: string; alt: [number, number]; temp: number; color: Color }> = {
  Plains: { de: 'Ebene', en: 'Plains', alt: [80, 600], temp: 18, color: 'W' },
  Island: { de: 'Insel', en: 'Island', alt: [0, 180], temp: 14, color: 'U' },
  Swamp: { de: 'Sumpf', en: 'Swamp', alt: [0, 60], temp: 21, color: 'B' },
  Mountain: { de: 'Gebirge', en: 'Mountain', alt: [1800, 6500], temp: -2, color: 'R' },
  Forest: { de: 'Wald', en: 'Forest', alt: [150, 1200], temp: 12, color: 'G' },
};

function land(c: DexInput, p: Parsed): DexEntry {
  const r = (id: string) => rngFor(`${c.seed}|${id}`);
  const terrains = p.subtypes.map((s) => TERRAIN[s]).filter((t) => t != null);
  const produced = [...new Set(p.text.match(/\{[WUBRGC]\}/g) ?? [])].length;
  const t = terrains[0];
  const basic = c.typeLine.includes('Basic');
  const specs: DexStat[] = [
    stat('area', L('Fläche', 'Area'), sig(r('area').jitter(basic ? 25 : p.legendary ? 600 : 80, 0.6)), 'km2'),
    stat('altitude', L('Höhe über dem Meer', 'Elevation'), Math.round(t ? r('alt').between(...t.alt) : r('alt').between(0, 2500)), 'm'),
    stat('temp', L('Durchschnittstemperatur', 'Average temperature'), Math.round(r('temp').jitter(t ? t.temp : 15, 0.35)), 'celsius'),
    stat('yield', L('Manaertrag pro Tag', 'Mana yield per day'), Math.max(1, produced || terrains.length || 1) * 24, 'mana'),
  ];
  const funny: DexStat[] = [
    stat('rating', L('Touristenbewertung', 'Tourist rating'), clamp(Math.round(r('stars').between(1, 5.4)), 1, 5), 'stars'),
    stat('lost', L('Chance sich zu verirren', 'Chance of getting lost'), Math.round(r('lost').between(3, 70)), 'percent'),
    stat('pop', L('Einwohner', 'Population'), sig(r('pop').jitter(p.subtypes.includes('Town') ? 4000 : t?.en === 'Plains' ? 900 : 120, 0.8)), 'count'),
  ];
  const tn = t ?? { de: 'Ort', en: 'Place' };
  const category = L(terrains.length > 1 ? terrains.map((x) => x.de).join('-') : `Mana-${tn.de}`, terrains.length > 1 ? terrains.map((x) => x.en).join('-') : `Mana ${tn.en}`);
  const habColor = t?.color ?? (c.colors[0] ?? 'colorless');
  return {
    kind: 'land', category, habitat: habitatFor(COLOR_HABITAT[habColor], c.plane), specs, funny,
    entry: join(L(`${c.name}: ${category.de}.`, `${c.name}: ${category.en}.`), L('Ein Ort, an dem Magier ihr Mana schöpfen.', 'A place where mages draw their mana.'), ...sentences(p, 0)),
  };
}

function battle(c: DexInput, p: Parsed): DexEntry {
  const r = (id: string) => rngFor(`${c.seed}|${id}`);
  const def = num(c.defense) ?? 4;
  const specs: DexStat[] = [
    stat('front', L('Frontlänge', 'Front length'), sig(r('front').jitter(def * 1800)), 'm'),
    stat('troops', L('Truppen', 'Troops'), sig(r('troops').jitter(def * 450)), 'count'),
    stat('duration', L('Dauer', 'Duration'), Math.round(r('dur').between(6, 72)), 'hours'),
    textStat('front-plane', L('Schauplatz', 'Theatre'), c.plane ?? L('Unbekannte Ebene', 'Unknown plane')),
  ];
  const funny: DexStat[] = [
    stat('morale', L('Moral der Truppen', 'Troop morale'), Math.round(r('morale').between(20, 99)), 'percent'),
    stat('danger', L('Gefahrenstufe', 'Danger level'), clamp(def + 2, 1, 10), 'rating10'),
  ];
  const category = L('Schlacht', 'Battle');
  return {
    kind: 'battle', category, habitat: habitatFor(L('Umkämpfte Gebiete', 'Contested ground'), c.plane), specs, funny,
    entry: join(L(`${c.name}: ${category.de}.`, `${c.name}: ${category.en}.`), L('Wer sie gewinnt, schreibt die nächste Seite der Geschichte.', 'Whoever wins it writes the next page of history.')),
  };
}

// --- entry point ------------------------------------------------------------------------------

export function generateDexEntry(card: DexInput): DexEntry {
  const p = parse(card);
  switch (kindOf(p)) {
    case 'creature': return creature(card, p);
    case 'vehicle': return vehicle(card, p);
    case 'planeswalker': return planeswalker(card, p);
    case 'battle': return battle(card, p);
    case 'land': return land(card, p);
    case 'equipment': return equipment(card, p, true);
    case 'artifact': return equipment(card, p, false);
    case 'enchantment': return enchantment(card, p);
    default: return spell(card, p, 'spell');
  }
}
