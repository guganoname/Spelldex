/**
 * Themes decide WHICH stats a card gets. Each theme has trigger words that are matched against
 * the card's name, type line, rules text, flavor text and (with the AI setting) the artwork
 * caption, and brings its own stats, funny stats, hobbies, fears and snacks. A fire elemental
 * scores high on "fire" and gets a burn temperature; a noble gets rank and fortune; a land with
 * a cave gets its depth. Values are scaled from the card's numbers and jittered per card.
 */
import type { DexKind, DexUnit, Loc } from './types.ts';

export interface Rng {
  next(): number;
  jitter(x: number, spread?: number): number;
  between(lo: number, hi: number): number;
  pick<T>(arr: readonly T[]): T;
}

export interface ThemeCtx {
  kind: DexKind;
  name: string;
  /** Size score: average of power and toughness, else from mana value. */
  s: number;
  mv: number;
  pw: number;
  tg: number;
  legendary: boolean;
  rarity: string;
  text: string;
  /** Type line (both faces' words), for stats that only fit some bodies. */
  types: string;
  /** Creature or planeswalker: something with a body, age and habits. */
  being: boolean;
  /** Rng stream per stat id. */
  r(id: string): Rng;
  /** First number captured by `re` in the rules text (X counts as the mana value). */
  num(re: RegExp): number | null;
}

export type StatDef = (
  | { id: string; label: Loc; unit: DexUnit; v(c: ThemeCtx): number }
  | { id: string; label: Loc; unit: 'text'; t(c: ThemeCtx): Loc }
) & { when?(c: ThemeCtx): boolean };

export interface Theme {
  id: string;
  /** Element/topic name, used in the background sentence ("Element: Feuer"). */
  name: Loc;
  re: RegExp;
  /** Only for these card kinds (default: all). */
  kinds?: DexKind[];
  stats: StatDef[];
  funny: StatDef[];
  hobby: Loc[];
  fear: Loc[];
  snack: Loc[];
  line: Loc;
}

const L = (de: string, en: string): Loc => ({ de, en });
const N = (id: string, de: string, en: string, unit: DexUnit, v: (c: ThemeCtx) => number): StatDef => ({ id, label: L(de, en), unit, v });
const T = (id: string, de: string, en: string, t: (c: ThemeCtx) => Loc): StatDef => ({ id, label: L(de, en), unit: 'text', t });
const R = (id: string, de: string, en: string, f: (c: ThemeCtx) => number): StatDef =>
  N(id, de, en, 'rating10', (c) => Math.max(1, Math.min(10, Math.round(f(c)))));
const P = (id: string, de: string, en: string, f: (c: ThemeCtx) => number): StatDef =>
  N(id, de, en, 'percent', (c) => Math.max(1, Math.min(99, Math.round(f(c)))));

/** Restricts a stat to cards where it makes sense. */
const only = (when: (c: ThemeCtx) => boolean, d: StatDef): StatDef => ({ ...d, when });
const being = (c: ThemeCtx) => c.being;
const moving = (c: ThemeCtx) => c.kind === 'creature' || c.kind === 'vehicle';
const winged = (c: ThemeCtx) => moving(c) && /\b(flying)\b/i.test(c.text + ' ' + c.types) || /Bird|Aven|Griffin|Pegasus|Angel|Dragon|Drake|Bat|Faerie|Sphinx|Phoenix|Thopter|Demon|Gargoyle/.test(c.types);
const feathered = (c: ThemeCtx) => /Bird|Aven|Griffin|Pegasus|Angel|Phoenix|Owl|Harpy|Archon/.test(c.types) || /\b(feathers?|birds?|owls?|eagles?|hawks?|crows?|ravens?)\b/i.test(c.name);
const undeadBody = (c: ThemeCtx) => /Zombie|Skeleton|Spirit|Vampire|Lich|Mummy|Wraith|Specter|Shade|Ghost|Horror|Spectre|Revenant|Wight|Ghoul/.test(c.types);
const plantlike = (c: ThemeCtx) => !c.being || /Treefolk|Plant|Fungus|Saproling|Dryad|Elemental/.test(c.types);
const g = (c: ThemeCtx, id: string, x: number, spread = 0.15) => c.r(id).jitter(x, spread);
const power = (c: ThemeCtx) => Math.max(1, c.pw || c.mv || 1);

export const THEMES: Theme[] = [
  {
    id: 'fire', name: L('Feuer', 'Fire'),
    re: /\b(fire|flame|burn|blaze|inferno|ember|pyre|pyro|magma|lava|molten|scorch|ignit|kindle|phoenix|ash(es)?|smoke|volcan|furnace|forge|cinder|sear|incinerat|combust|hellfire|wildfire|efreet|salamander|blast)/i,
    stats: [
      N('burnTemp', 'Brenntemperatur', 'Burn temperature', 'celsius', (c) => g(c, 'burnTemp', 650 + 140 * c.mv + 60 * c.pw)),
      N('flameHeight', 'Flammenhöhe', 'Flame height', 'm', (c) => g(c, 'flameHeight', 0.8 + 1.1 * power(c))),
      N('heatRadius', 'Hitzeradius', 'Heat radius', 'm', (c) => g(c, 'heatRadius', 3 + 4 * c.mv)),
      N('smoke', 'Rauchausstoß pro Minute', 'Smoke output per minute', 'cubicm', (c) => g(c, 'smoke', 40 * (1 + c.mv) ** 1.6, 0.3)),
    ],
    funny: [
      R('fireHazard', 'Brandgefahr', 'Fire hazard', (c) => 6 + c.mv / 2),
      N('marshmallows', 'Gegrillte Marshmallows pro Stunde', 'Marshmallows toasted per hour', 'count', (c) => Math.round(g(c, 'marsh', 20 + 15 * c.mv, 0.4))),
    ],
    hobby: [L('Grillen', 'Barbecuing'), L('Feuerjonglage', 'Fire juggling'), L('Kerzen anzünden', 'Lighting candles')],
    fear: [L('Regen', 'Rain'), L('Feuerlöscher', 'Fire extinguishers'), L('Pfützen', 'Puddles')],
    snack: [L('Holzkohle', 'Charcoal'), L('Glühende Kohlen', 'Glowing coals'), L('Scharfe Chilis', 'Hot chillies')],
    line: L('Wo es auftaucht, wird es schnell sehr warm.', 'Wherever it shows up, things get hot fast.'),
  },
  {
    id: 'ice', name: L('Eis', 'Ice'),
    re: /\b(ice|icy|frost|snow|freez|frozen|glaci|winter|cold\b|rime|chill|blizzard|hail\b|tundra|polar|yeti|frigid|arctic|boreal)/i,
    stats: [
      N('coreTemp', 'Körpertemperatur', 'Body temperature', 'celsius', (c) => -g(c, 'coreTemp', 15 + 8 * c.mv)),
      N('frostRadius', 'Frostradius', 'Frost radius', 'm', (c) => g(c, 'frostRadius', 2 + 3 * c.mv)),
      N('iceThick', 'Eisschicht pro Atemzug', 'Ice per breath', 'm', (c) => g(c, 'iceThick', 0.01 + 0.012 * c.mv)),
    ],
    funny: [
      N('scarves', 'Getragene Schals', 'Scarves worn', 'count', (c) => Math.round(c.r('scarf').between(0, 4))),
      P('snowman', 'Chance auf einen Schneemann', 'Chance of a snowman', (c) => c.r('snowman').between(30, 90)),
    ],
    hobby: [L('Eisskulpturen', 'Ice sculpting'), L('Schlittschuhlaufen', 'Ice skating')],
    fear: [L('Sommer', 'Summer'), L('Saunagänge', 'Saunas')],
    snack: [L('Eiszapfen am Stiel', 'Icicles on a stick'), L('Schneeflocken', 'Snowflakes')],
    line: L('Hinterlässt Raureif auf allem, was es berührt.', 'Leaves hoarfrost on everything it touches.'),
  },
  {
    id: 'storm', name: L('Sturm', 'Storm'),
    re: /\b(lightning|thunder|storm\b|tempest|spark\b|electr|shock\b|volt\b|bolt\b|gale\b|gust\b|wind\b|cyclone|tornado|hurricane|squall|zap\b|static\b|galvan)/i,
    stats: [
      N('voltage', 'Spannung', 'Voltage', 'kv', (c) => g(c, 'voltage', 50 * 2 ** Math.min(8, c.mv), 0.3)),
      N('windSpeed', 'Windgeschwindigkeit', 'Wind speed', 'kmh', (c) => g(c, 'windSpeed', 60 + 25 * c.mv)),
      N('strikes', 'Blitze pro Minute', 'Lightning strikes per minute', 'count', (c) => Math.max(1, Math.round(g(c, 'strikes', 2 + 2 * c.mv, 0.4)))),
    ],
    funny: [
      R('hairStatic', 'Haarsträubfaktor', 'Hair-raising factor', (c) => 5 + c.mv / 2),
      N('umbrellas', 'Zerstörte Regenschirme', 'Umbrellas destroyed', 'count', (c) => Math.round(g(c, 'umb', 30 * (1 + c.mv), 0.5))),
    ],
    hobby: [L('Drachensteigen', 'Kite flying'), L('Wetterleuchten', 'Heat lightning')],
    fear: [L('Windstille', 'Dead calm'), L('Gummistiefel', 'Rubber boots')],
    snack: [L('Knisterbrause', 'Popping candy'), L('Batterien', 'Batteries')],
    line: L('Die Luft riecht nach Ozon, kurz bevor es zuschlägt.', 'The air smells of ozone just before it strikes.'),
  },
  {
    id: 'sea', name: L('Wasser', 'Water'),
    re: /\b(sea\b|ocean|tide\b|wave\b|deep\b|depth|drown|reef\b|coral|kraken|leviathan|merfolk|mermaid|fish\b|shark|whale|octopus|squid|crab\b|eel\b|serpent|island|coast|shore|harbor|harbour|bay\b|lagoon|river|lake\b|water|aqua|naga|siren|tidal|abyss|islandwalk|surf|current|flood|rain\b)/i,
    stats: [
      N('waterVolume', 'Bewegte Wassermenge', 'Water displaced', 'cubicm', (c) => g(c, 'waterVolume', 50 * (1 + c.mv) ** 2.2, 0.4)),
      only(being, N('diveDepth', 'Tauchtiefe', 'Dive depth', 'm', (c) => g(c, 'diveDepth', 40 * 1.6 ** Math.min(12, c.s + 1), 0.25))),
      only(being, N('holdBreath', 'Luft anhalten', 'Holds breath for', 'minutes', (c) => g(c, 'holdBreath', 8 + 6 * c.s, 0.3))),
      only(moving, N('swim', 'Schwimmtempo', 'Swim speed', 'knots', (c) => g(c, 'swim', 6 + 3 * c.s))),
      N('salinity', 'Salzgehalt', 'Salinity', 'permille', (c) => g(c, 'salinity', 35, 0.12)),
    ],
    funny: [
      N('wetTowels', 'Nasse Handtücher pro Tag', 'Wet towels per day', 'count', (c) => Math.round(c.r('towel').between(3, 30))),
      P('seasick', 'Seekrankheit', 'Seasickness', (c) => c.r('seasick').between(1, 8)),
    ],
    hobby: [L('Muscheln sammeln', 'Collecting shells'), L('Wellenreiten', 'Surfing'), L('Schiffe versenken', 'Sinking ships')],
    fear: [L('Dürre', 'Drought'), L('Fischernetze', 'Fishing nets'), L('Wüsten', 'Deserts')],
    snack: [L('Seetang-Sushi', 'Kelp sushi'), L('Plankton-Müsli', 'Plankton muesli'), L('Fischstäbchen', 'Fish fingers')],
    line: L('Fühlt sich in tiefem Wasser am wohlsten.', 'Feels most at home in deep water.'),
  },
  {
    id: 'sky', name: L('Himmel', 'Sky'),
    re: /\b(flying|flier|flyer|sky\b|cloud\b|wing\b|feather|soar|aerial|air\b|birds?\b|aven\b|griffin|pegasus|roc\b|eagles?\b|hawks?\b|owl\b|crows?\b|ravens?\b|thopter|kite\b|zephyr|heaven)/i,
    stats: [
      only((c) => !moving(c), N('airLift', 'Auftrieb', 'Lift', 'newton', (c) => g(c, 'liftAir', 300 * (1 + c.mv) ** 1.5, 0.4))),
      only(winged, N('wingspan', 'Spannweite', 'Wingspan', 'm', (c) => g(c, 'wingspan', 1.2 * 1.35 ** Math.min(12, c.s + 1)))),
      only(moving, N('ceiling', 'Flughöhe', 'Flight ceiling', 'm', (c) => g(c, 'ceiling', Math.min(12000, 300 * 1.45 ** c.s), 0.25))),
      only(moving, N('flightSpeed', 'Fluggeschwindigkeit', 'Flight speed', 'kmh', (c) => g(c, 'flightSpeed', 45 + 18 * c.s))),
      only(feathered, N('feathers', 'Federn', 'Feathers', 'count', (c) => Math.round(g(c, 'feathers', 3000 * (1 + c.s), 0.3)))),
    ],
    funny: [
      P('landing', 'Elegante Landungen', 'Graceful landings', (c) => c.r('land').between(40, 95)),
      N('birdsBefriended', 'Befreundete Vögel', 'Birds befriended', 'count', (c) => Math.round(c.r('birds').between(2, 300))),
    ],
    hobby: [L('Wolken zählen', 'Cloud spotting'), L('Thermik reiten', 'Riding thermals')],
    fear: [L('Käfige', 'Cages'), L('Netze', 'Nets'), L('Tiefe Decken', 'Low ceilings')],
    snack: [L('Wolkenkuchen', 'Cloud cake'), L('Würmer à la carte', 'Worms à la carte')],
    line: L('Wird fast nur mit Blick nach oben gesichtet.', 'Usually sighted by looking up.'),
  },
  {
    id: 'earth', name: L('Stein', 'Stone'),
    re: /\b(stone|rock\b|earth|quake|tremor|crystal|granite|boulder|golem|gargoyle|mountain|cliff|cave\b|cavern|mine\b|ore\b|gem\b|marble|obsidian|landslide|avalanche|terra|dirt\b|sand\b|clay\b|mud\b|statue|monolith)/i,
    stats: [
      N('hardness', 'Härte (Mohs)', 'Hardness (Mohs)', 'decimal', (c) => Math.min(10, g(c, 'hardness', 4 + c.tg * 0.6, 0.15))),
      N('quake', 'Erdbebenstärke beim Aufstampfen', 'Quake when stomping', 'richter', (c) => Math.min(9.5, g(c, 'quake', 2 + c.s * 0.55, 0.15))),
      N('density', 'Dichte', 'Density', 'gcm3', (c) => g(c, 'density', 2.7, 0.2)),
    ],
    funny: [
      N('pebbles', 'Kieselsteine in den Taschen', 'Pebbles in pockets', 'count', (c) => Math.round(c.r('peb').between(5, 400))),
      R('patience', 'Geduld', 'Patience', (c) => 7 + c.r('pat').between(0, 3)),
    ],
    hobby: [L('Steine sammeln', 'Rock collecting'), L('Stillstehen', 'Standing still'), L('Höhlenforschung', 'Caving')],
    fear: [L('Spitzhacken', 'Pickaxes'), L('Erosion', 'Erosion')],
    snack: [L('Kieselsuppe', 'Pebble soup'), L('Mineralwasser, sehr mineralisch', 'Very mineral water')],
    line: L('Bewegt sich langsam, aber nichts hält es auf.', 'Moves slowly, but nothing stops it.'),
  },
  {
    id: 'nature', name: L('Natur', 'Nature'),
    re: /\b(tree\b|forest|wood\b|grove|vine\b|root\b|bloom|blossom|seed\b|flower|leaf\b|leaves|bark\b|thorn|bramble|moss\b|grow\b|growth|wild\b|jungle|treefolk|dryad|druid|plant|garden|harvest|sprout|verdant|meadow|elf|elves|forestwalk|land you control|ramp)/i,
    stats: [
      only(being, N('animals', 'Befreundete Tiere', 'Animal friends', 'count', (c) => Math.round(c.r('animals').between(5, 120)))),
      only(being, N('herbs', 'Bekannte Heilkräuter', 'Healing herbs known', 'count', (c) => Math.round(c.r('herbs').between(12, 140)))),
      only(being, N('barefoot', 'Barfuß gelaufen', 'Walked barefoot', 'km', (c) => g(c, 'barefoot', 4000, 0.6))),
      N('age', 'Alter', 'Age', 'years', (c) => Math.round(g(c, 'age', 60 * (1 + c.s) ** 1.5, 0.4))),
      only(plantlike, N('rootDepth', 'Wurzeltiefe', 'Root depth', 'm', (c) => g(c, 'rootDepth', 1 + 1.4 * c.s))),
      only(plantlike, N('leaves', 'Blätter', 'Leaves', 'count', (c) => Math.round(g(c, 'leaves', 2000 * (1 + c.s) ** 2, 0.4)))),
      only(plantlike, P('photo', 'Photosynthese-Effizienz', 'Photosynthesis efficiency', (c) => c.r('photo').between(4, 30))),
    ],
    funny: [
      N('squirrels', 'Untermieter (Eichhörnchen)', 'Lodgers (squirrels)', 'count', (c) => Math.round(c.r('sq').between(0, 40))),
      R('sunbathing', 'Sonnenbad-Leidenschaft', 'Love of sunbathing', (c) => 6 + c.r('sun').between(0, 4)),
    ],
    hobby: [L('Sonnenbaden', 'Sunbathing'), L('Vögel beherbergen', 'Hosting birds'), L('Langsam wachsen', 'Growing slowly')],
    fear: [L('Holzfäller', 'Lumberjacks'), L('Rasenmäher', 'Lawnmowers'), L('Borkenkäfer', 'Bark beetles')],
    snack: [L('Sonnenlicht', 'Sunlight'), L('Regenwasser', 'Rainwater'), L('Kompost', 'Compost'), L('Wildbeeren', 'Wild berries')],
    line: L('Riecht nach frischem Laub und feuchter Erde.', 'Smells of fresh leaves and damp earth.'),
  },
  {
    id: 'fungus', name: L('Pilz', 'Fungus'),
    re: /\b(spore\b|fung|mushroom|saproling|mold\b|mould|rot\b|decay|mycel|toadstool|thallid|myco\b)/i,
    stats: [
      N('spores', 'Sporen pro Tag', 'Spores per day', 'count', (c) => Math.round(g(c, 'spores', 1e6 * (1 + c.mv) ** 2, 0.5))),
      N('mycel', 'Myzelnetz', 'Mycelium network', 'm', (c) => g(c, 'mycel', 50 * (1 + c.mv) ** 2, 0.5)),
      P('humidity', 'Wohlfühl-Luftfeuchte', 'Preferred humidity', (c) => c.r('hum').between(75, 98)),
    ],
    funny: [R('smell', 'Geruchsintensität', 'Smell intensity', (c) => 5 + c.r('smell').between(0, 5))],
    hobby: [L('Kellerpartys', 'Cellar parties'), L('Kompostieren', 'Composting')],
    fear: [L('Sonnige Fensterbänke', 'Sunny windowsills'), L('Pilzsammler', 'Mushroom pickers')],
    snack: [L('Totholz', 'Dead wood'), L('Altes Brot', 'Stale bread')],
    line: L('Verbreitet sich still, bis plötzlich alles voll davon ist.', 'Spreads quietly until suddenly it is everywhere.'),
  },
  {
    id: 'death', name: L('Tod', 'Death'),
    re: /\b(death|dead\b|die\b|dies\b|grave|graveyard|zombie|skeleton|undead|lich|tomb\b|crypt|corpse|necro|bone\b|skull|ghoul|mummy|wight|revenant|reanimat|from (your|a|their) graveyard|morbid|carrion|rot|decay|funeral|soul|spirit|ghost|specter|spectre|wraith|haunt|shade)/i,
    stats: [
      only((c) => !c.being, N('deathToll', 'Opfer pro Anwendung', 'Victims per use', 'count', (c) => Math.max(1, Math.round(g(c, 'toll', 1 + c.mv * 1.5, 0.4))))),
      only((c) => c.being && !undeadBody(c), N('graves', 'Ausgehobene Gräber', 'Graves dug', 'count', (c) => Math.round(c.r('graves').between(3, 200)))),
      P('lethality', 'Tödlichkeit', 'Lethality', (c) => 40 + c.mv * 7 + c.r('leth').between(0, 15)),
      only(undeadBody, N('deceased', 'Verstorben seit', 'Deceased for', 'years', (c) => Math.round(c.r('deceased').between(3, 80) * (1 + c.mv)))),
      only(undeadBody, N('bodyTempDead', 'Körpertemperatur', 'Body temperature', 'celsius', (c) => g(c, 'bodyTempDead', 9, 0.4))),
      N('souls', 'Gesammelte Seelen', 'Souls collected', 'count', (c) => Math.round(g(c, 'souls', 3 * (1 + c.mv) ** 2, 0.5))),
      only(undeadBody, P('decay', 'Verwesungsgrad', 'Decay level', (c) => c.r('decay').between(15, 85))),
    ],
    funny: [
      N('haunted', 'Heimgesuchte Häuser', 'Houses haunted', 'count', (c) => Math.round(c.r('haunt').between(0, 25))),
      R('spooky', 'Gruselfaktor', 'Spookiness', (c) => 5 + c.mv / 2),
    ],
    hobby: [L('Spuken', 'Haunting'), L('Grabsteine polieren', 'Polishing headstones'), L('Kettenrasseln', 'Rattling chains')],
    fear: [L('Sonnenlicht', 'Sunlight'), L('Weihwasser', 'Holy water'), L('Exorzisten', 'Exorcists')],
    snack: [L('Gehirn (bio)', 'Brains (organic)'), L('Staub und Erinnerungen', 'Dust and memories'), L('Friedhofserde', 'Graveyard soil')],
    line: L('Hat das Sterben hinter sich und sieht keinen Grund, aufzuhören.', 'Has already died and sees no reason to stop.'),
  },
  {
    id: 'blood', name: L('Blut', 'Blood'),
    re: /\b(blood|vampir|bleed|drain|feed\b|fang\b|bite\b|crimson|sanguine|thirst|lose .* life|loses .* life)/i,
    stats: [
      N('bloodDrained', 'Abgezapftes Blut', 'Blood drained', 'liters', (c) => g(c, 'drained', 1 + 1.5 * c.mv, 0.4)),
      only(being, N('bloodThirst', 'Blutdurst pro Woche', 'Blood thirst per week', 'liters', (c) => g(c, 'bloodThirst', 0.5 + 0.4 * c.mv, 0.3))),
      only(being, N('fangLength', 'Eckzahnlänge', 'Fang length', 'm', (c) => g(c, 'fangLength', 0.025 + 0.004 * c.pw, 0.2))),
      only(being, N('nightVision', 'Nachtsicht', 'Night vision', 'm', (c) => g(c, 'nightVision', 150 + 40 * c.mv))),
    ],
    funny: [
      R('garlic', 'Knoblauch-Abneigung', 'Garlic aversion', () => 10),
      N('mirrors', 'Spiegel im Haus', 'Mirrors at home', 'count', () => 0),
    ],
    hobby: [L('Opernbälle', 'Opera balls'), L('Nachtspaziergänge', 'Night walks')],
    fear: [L('Knoblauch', 'Garlic'), L('Sonnenaufgang', 'Sunrise'), L('Holzpflöcke', 'Wooden stakes')],
    snack: [L('Rotwein (angeblich)', 'Red wine (allegedly)'), L('Blutorangen', 'Blood oranges')],
    line: L('Wird nach Einbruch der Dunkelheit erst richtig wach.', 'Only really wakes up after dark.'),
  },
  {
    id: 'poison', name: L('Gift', 'Poison'),
    re: /\b(poison|venom|toxi|deathtouch|plague|pestilence|infect|sting|snake|scorpion|spider|wasp|acid|corrosi|ooze|blight|sickness|disease|miasma|-1\/-1)/i,
    stats: [
      N('toxicity', 'Giftdosis für einen Ritter', 'Dose to fell a knight', 'mg', (c) => g(c, 'toxicity', 400 / (1 + c.mv), 0.3)),
      N('venomYield', 'Giftvorrat', 'Venom reserve', 'ml', (c) => g(c, 'venomYield', 2 + 3 * c.s, 0.3)),
      N('onset', 'Wirkung setzt ein nach', 'Takes effect after', 'seconds', (c) => g(c, 'onset', 60 / (1 + c.pw), 0.3)),
    ],
    funny: [
      N('antidotes', 'Gegengifte, die versagt haben', 'Antidotes that failed', 'count', (c) => Math.round(c.r('anti').between(3, 60))),
      R('touchability', 'Anfassbarkeit', 'Touchability', () => 1),
    ],
    hobby: [L('Kräuter mischen', 'Mixing herbs'), L('Giftpilze bestimmen', 'Identifying toadstools')],
    fear: [L('Gegengift', 'Antidotes'), L('Heiler', 'Healers')],
    snack: [L('Fliegenpilz-Chips', 'Toadstool crisps'), L('Säurebonbons', 'Acid drops')],
    line: L('Ein einziger Kratzer genügt. Abstand halten!', 'A single scratch is enough. Keep your distance!'),
  },
  {
    id: 'shadow', name: L('Schatten', 'Shadow'),
    re: /\b(shadow|dark\b|night|gloom|dusk|midnight|eclipse|nightmare|dread|fear\b|terror|horror|black|void\b|abyss|despair|curse|hex\b|doom|menace|ninja|assassin|rogue|thief|stealth|sneak|unblockable|can't be blocked|hidden\b|disguise|spy\b)/i,
    stats: [
      P('lightAbsorb', 'Lichtschluckung', 'Light absorption', (c) => c.r('lightAbsorb').between(60, 99)),
      P('stealth', 'Tarnung', 'Stealth', (c) => c.r('stealth').between(55, 97)),
      N('noise', 'Schrittlautstärke', 'Footstep noise', 'db', (c) => g(c, 'noise', 12, 0.4)),
    ],
    funny: [
      N('jumpScares', 'Erschreckte Passanten pro Nacht', 'Passers-by startled per night', 'count', (c) => Math.round(c.r('scare').between(1, 30))),
      R('mystery', 'Geheimniskrämerei', 'Secretiveness', () => 9),
    ],
    hobby: [L('Lauschen', 'Eavesdropping'), L('Im Dunkeln lesen', 'Reading in the dark'), L('Verschwinden', 'Vanishing')],
    fear: [L('Laternen', 'Lanterns'), L('Mittagssonne', 'Midday sun'), L('Quietschende Dielen', 'Creaky floorboards')],
    snack: [L('Bitterschokolade', 'Dark chocolate'), L('Lakritz', 'Liquorice')],
    line: L('Ist meist schon da, bevor jemand es bemerkt.', 'Usually there before anyone notices.'),
  },
  {
    id: 'light', name: L('Licht', 'Light'),
    re: /\b(light\b|lights|holy|divine|sun\b|dawn|radiant|angel|cleric|bless|sanctu|glory|halo|celestial|heaven|pray|faith|church|cathedral|monk|paladin|purif|sacred|gods?|archon|lifegain|gain \d+ life|you gain|protection|ward|shield|white)/i,
    stats: [
      N('brightness', 'Leuchtkraft', 'Brightness', 'lumen', (c) => g(c, 'brightness', 800 * (1 + c.mv) ** 1.8, 0.3)),
      R('holiness', 'Heiligkeit', 'Holiness', (c) => 4 + c.mv * 0.8),
      only(being, N('prayers', 'Gebete pro Tag', 'Prayers per day', 'count', (c) => Math.round(c.r('pray').between(3, 20)))),
    ],
    funny: [
      N('sunglasses', 'Benötigte Sonnenbrillen', 'Sunglasses required', 'count', (c) => 1 + Math.round(c.mv / 3)),
      R('righteous', 'Rechthaberei', 'Self-righteousness', (c) => 6 + c.r('right').between(0, 4)),
    ],
    hobby: [L('Chorgesang', 'Choir singing'), L('Gute Taten', 'Good deeds'), L('Heiligenschein polieren', 'Polishing halos')],
    fear: [L('Sonnenfinsternis', 'Eclipses'), L('Ausreden', 'Excuses')],
    snack: [L('Hostien', 'Wafers'), L('Honigbrot', 'Honey bread'), L('Lichtstrahlen', 'Sunbeams')],
    line: L('Strahlt so hell, dass man es auch nachts findet.', 'Shines so brightly you can find it at night.'),
  },
  {
    id: 'mind', name: L('Geist', 'Mind'),
    re: /\b(wizard|sphinx|scholar|sage|mind|thought|knowledge|lore|study|library|archive|book|tome|scroll|insight|clever|genius|draw (a|two|three|\w+) cards?|scry|investigate|clue|learn|lesson|memory|psychic|telepath|vedalken|advisor|detective|puzzle|riddle|counter target)/i,
    stats: [
      N('insight', 'Erkenntnis in Buchseiten', 'Insight in book pages', 'count', (c) => Math.round(g(c, 'insight', 40 * (1 + c.mv) ** 1.5, 0.4))),
      N('secrets', 'Enthüllte Geheimnisse', 'Secrets revealed', 'count', (c) => Math.max(1, Math.round(g(c, 'secrets', 2 + 2 * c.mv, 0.5)))),
      only(being, N('iq', 'IQ', 'IQ', 'count', (c) => Math.round(g(c, 'iq', 110 + 12 * c.mv, 0.08)))),
      only(being, N('books', 'Gelesene Bücher', 'Books read', 'count', (c) => Math.round(g(c, 'books', 200 * (1 + c.mv) ** 1.5, 0.4)))),
      only(being, N('thoughts', 'Gedanken pro Sekunde', 'Thoughts per second', 'count', (c) => Math.max(1, Math.round(g(c, 'thoughts', 3 + 2 * c.mv, 0.3))))),
      only(being, N('languages', 'Gesprochene Sprachen', 'Languages spoken', 'count', (c) => Math.max(1, Math.round(c.r('lang').between(2, 6 + c.mv))))),
    ],
    funny: [
      R('knowItAll', 'Besserwisserei', 'Know-it-all-ness', (c) => 6 + c.mv / 2),
      N('overdue', 'Überfällige Bibliotheksbücher', 'Overdue library books', 'count', (c) => Math.round(c.r('overdue').between(0, 40))),
    ],
    hobby: [L('Kreuzworträtsel', 'Crosswords'), L('Schach', 'Chess'), L('Fußnoten schreiben', 'Writing footnotes')],
    fear: [L('Dumme Fragen', 'Silly questions'), L('Leere Regale', 'Empty shelves'), L('Vergesslichkeit', 'Forgetfulness')],
    snack: [L('Walnüsse (gut fürs Gehirn)', 'Walnuts (brain food)'), L('Kalter Tee', 'Cold tea')],
    line: L('Weiß meist schon die Antwort, bevor die Frage fertig ist.', 'Usually knows the answer before the question is finished.'),
  },
  {
    id: 'illusion', name: L('Illusion', 'Illusion'),
    re: /\b(illusion|phantasm|mirror|reflect|copy\b|clone|duplicate|shapeshift|changeling|mimic|dream\b|trick\b|fake\b|mask\b|imposter|impostor|doppel)/i,
    stats: [
      P('realness', 'Echtheit', 'Realness', (c) => c.r('realness').between(5, 60)),
      N('disguises', 'Verkleidungen', 'Disguises', 'count', (c) => Math.round(c.r('disg').between(5, 120))),
      N('fooled', 'Getäuschte Zuschauer', 'Onlookers fooled', 'count', (c) => Math.round(g(c, 'fooled', 300 * (1 + c.mv), 0.5))),
    ],
    funny: [R('trust', 'Vertrauenswürdigkeit', 'Trustworthiness', () => 2)],
    hobby: [L('Zaubertricks', 'Magic tricks'), L('Verkleiden', 'Dressing up')],
    fear: [L('Kneifen', 'Being pinched'), L('Skeptiker', 'Sceptics')],
    snack: [L('Luftschlösser', 'Castles in the air'), L('Zuckerwatte', 'Candy floss')],
    line: L('Ist vielleicht gar nicht wirklich da.', 'Might not really be there at all.'),
  },
  {
    id: 'time', name: L('Zeit', 'Time'),
    re: /\b(time|clock\b|chrono|era\b|eternal|aeon\b|eon\b|extra turn|future|past\b|ancient|age\b|centur|timeless|suspend|delay\b|rewind|epoch|hourglass|foretell)/i,
    stats: [
      N('timeShift', 'Zeitverschiebung', 'Time shift', 'seconds', (c) => g(c, 'timeShift', 3 * 2 ** Math.min(10, c.mv), 0.4)),
      N('timeAge', 'Erlebte Jahrhunderte', 'Centuries witnessed', 'count', (c) => Math.max(1, Math.round(c.r('cent').between(1, 10 + 4 * c.mv)))),
    ],
    funny: [N('lateness', 'Verspätung zu Terminen', 'Lateness for appointments', 'minutes', (c) => Math.round(c.r('late').between(-30, 90)))],
    hobby: [L('Uhren reparieren', 'Repairing clocks'), L('Geschichte umschreiben', 'Rewriting history')],
    fear: [L('Deadlines', 'Deadlines'), L('Zeitparadoxa', 'Time paradoxes')],
    snack: [L('Gestriges Brot von morgen', "Tomorrow's day-old bread"), L('Sanduhrsand', 'Hourglass sand')],
    line: L('Kommt manchmal an, bevor es losgegangen ist.', 'Sometimes arrives before it set off.'),
  },
  {
    id: 'noble', name: L('Adel', 'Nobility'),
    re: /\b(noble|king\b|queen|lord\b|lady\b|baron|duke\b|duchess|count(ess)?\b|prince|princess|emperor|empress|aristocrat|royal|crown|throne|regent|monarch|majesty|court|sovereign|heir\b|scion|patrician|senator|chancellor|archduke|emir|sultan|pharaoh|treasure|gold\b|wealth|coin\b|tithe|tax|bounty|riches|vault|bank|merchant|trade)/i,
    stats: [
      only((c) => !c.being, N('value', 'Schätzwert in Goldmünzen', 'Estimated value in gold coins', 'count', (c) => Math.round(g(c, 'value', 300 * 3 ** Math.min(10, c.mv), 0.5)))),
      only(being, T('rank', 'Adelsrang', 'Rank', (c) => [L('Ritter', 'Knight'), L('Baron', 'Baron'), L('Graf', 'Count'), L('Herzog', 'Duke'), L('König', 'King')][Math.min(4, Math.floor((c.mv + (c.legendary ? 2 : 0)) / 2))]!)),
      N('fortune', 'Vermögen in Goldmünzen', 'Fortune in gold coins', 'count', (c) => Math.round(g(c, 'fortune', 2000 * 3 ** Math.min(10, c.mv) * (c.legendary ? 5 : 1), 0.4))),
      only(being, N('servants', 'Bedienstete', 'Servants', 'count', (c) => Math.round(g(c, 'servants', 4 * (1 + c.mv) ** 1.6, 0.4)))),
      only(being, N('lineage', 'Ahnenreihe', 'Lineage', 'generations', (c) => Math.max(2, Math.round(c.r('gen').between(4, 30))))),
    ],
    funny: [
      N('rings', 'Getragene Ringe', 'Rings worn', 'count', (c) => Math.round(c.r('rings').between(2, 10))),
      R('snobbery', 'Nasenhöhe', 'Nose height', (c) => 6 + c.mv / 2),
      N('teaParties', 'Teekränzchen pro Woche', 'Tea parties per week', 'count', (c) => Math.round(c.r('tea').between(1, 9))),
    ],
    hobby: [L('Teekränzchen', 'Tea parties'), L('Münzen zählen', 'Counting coins'), L('Bälle geben', 'Hosting balls'), L('Erbstreit', 'Inheritance feuds')],
    fear: [L('Steuerprüfung', 'Tax audits'), L('Revolutionen', 'Revolutions'), L('Flecken auf Seide', 'Stains on silk')],
    snack: [L('Kaviar auf Goldtellern', 'Caviar on gold plates'), L('Petit Fours', 'Petits fours'), L('Gänsestopfleber', 'Foie gras')],
    line: L('Erwartet, dass man sich verbeugt.', 'Expects a bow.'),
  },
  {
    id: 'military', name: L('Militär', 'Military'),
    re: /\b(soldier|knight|army|legion|general|captain|commander|warrior|battalion|squad|militia|sergeant|marshal|guard|sentinel|sentry|champion|veteran|war\b|battle|siege|fortress|garrison|cavalry|lancer|archer|samurai|berserker|gladiator|armou?r|shield|helm|vigilance|first strike|double strike|outnumber|battalion|mentor|crusade|banner)/i,
    stats: [
      N('troops', 'Befehligte Truppen', 'Troops commanded', 'count', (c) => Math.round(g(c, 'troops', 10 * 2.2 ** Math.min(10, c.mv), 0.4))),
      N('battles', 'Gewonnene Schlachten', 'Battles won', 'count', (c) => Math.round(c.r('battles').between(3, 40 + 15 * c.pw))),
      only((c) => c.being || c.kind === 'equipment' || c.kind === 'vehicle', N('armour', 'Rüstungsstärke', 'Armour thickness', 'mm', (c) => g(c, 'armour', 2 + 1.5 * c.tg, 0.25))),
      only(being, N('marchSpeed', 'Marschtempo', 'Marching pace', 'kmh', (c) => g(c, 'marchSpeed', 5.5, 0.15))),
    ],
    funny: [
      N('medals', 'Orden an der Brust', 'Medals on chest', 'count', (c) => Math.round(c.r('medals').between(1, 25))),
      N('pushups', 'Liegestütze vor dem Frühstück', 'Push-ups before breakfast', 'count', (c) => Math.round(g(c, 'push', 50 + 30 * c.pw, 0.3))),
    ],
    hobby: [L('Paraden', 'Parades'), L('Schwert schleifen', 'Sharpening swords'), L('Strategiespiele', 'Strategy games')],
    fear: [L('Rückzug', 'Retreat'), L('Rost', 'Rust'), L('Meutereien', 'Mutinies')],
    snack: [L('Feldration', 'Field rations'), L('Zwieback', 'Hardtack'), L('Erbsensuppe', 'Pea soup')],
    line: L('Steht immer stramm, auch im Schlaf.', 'Always stands to attention, even asleep.'),
  },
  {
    id: 'speed', name: L('Tempo', 'Speed'),
    re: /\b(haste|swift|speed|fast\b|quick|racer\b|racing|rush\b|charge|dash\b|sprint|cheetah|horse\b|steed|rider\b|mount\b|cavalry|courier|messenger|flash|blitz|velocity|express|nimble)/i,
    stats: [
      only(moving, N('topSpeed', 'Höchsttempo', 'Top speed', 'kmh', (c) => g(c, 'topSpeed', 40 + 14 * c.pw))),
      N('reaction', 'Reaktionszeit', 'Reaction time', 'ms', (c) => g(c, 'reaction', 260 / (1 + c.pw / 3), 0.2)),
      only(moving, N('accel', '0 auf 100 km/h', '0 to 100 km/h', 'seconds', (c) => Math.max(1.5, g(c, 'accel', 12 - c.pw, 0.2)))),
    ],
    funny: [
      N('tickets', 'Strafzettel wegen Raserei', 'Speeding tickets', 'count', (c) => Math.round(c.r('tickets').between(2, 90))),
      R('patienceLow', 'Geduld', 'Patience', () => 2),
    ],
    hobby: [L('Wettrennen', 'Racing'), L('Rekorde brechen', 'Breaking records')],
    fear: [L('Stau', 'Traffic jams'), L('Warteschlangen', 'Queues'), L('Schneckentempo', 'Snail pace')],
    snack: [L('Energieriegel', 'Energy bars'), L('Espresso', 'Espresso')],
    line: L('Ist schon wieder weg, bevor man hinsieht.', 'Gone again before you look.'),
  },
  {
    id: 'brute', name: L('Kraft', 'Strength'),
    re: /\b(giant|ogre|troll|titan|colossus|colossal|behemoth|juggernaut|brute|smash|crush|trample|stomp|rampage|berserk|fury|rage|strength|mighty|massive|huge\b|enormous|gargantuan|siege|wrecking|bash\b|pummel|minotaur|cyclops|rhino|mammoth|elephant)/i,
    stats: [
      only((c) => !c.being, N('impact', 'Aufprallenergie', 'Impact energy', 'kj', (c) => g(c, 'impact', 40 * 2.2 ** Math.min(12, c.mv), 0.3))),
      only(being, N('lift', 'Hebekraft', 'Lifting capacity', 'kg', (c) => g(c, 'lift', 150 * 2 ** Math.min(12, c.pw), 0.3))),
      only(being, N('punch', 'Schlagkraft', 'Punch force', 'newton', (c) => g(c, 'punch', 2500 * 1.8 ** Math.min(12, c.pw), 0.3))),
      only(being, N('stride', 'Schrittlänge', 'Stride length', 'm', (c) => g(c, 'stride', 0.8 + 0.5 * c.s))),
    ],
    funny: [
      N('doors', 'Kaputte Türrahmen', 'Door frames broken', 'count', (c) => Math.round(g(c, 'doors', 10 + 8 * c.pw, 0.5))),
      R('gentle', 'Feingefühl', 'Delicacy', () => 1),
    ],
    hobby: [L('Gewichtheben', 'Weightlifting'), L('Baumstammwerfen', 'Caber tossing'), L('Türen aufreißen', 'Ripping doors open')],
    fear: [L('Porzellanläden', 'China shops'), L('Niedrige Decken', 'Low ceilings')],
    snack: [L('Ein ganzes Ochsenviertel', 'A whole side of beef'), L('Felsbrocken an Kiefernnadeln', 'Boulders on pine needles')],
    line: L('Bleibt für nichts und niemanden stehen.', 'Does not stop for anything in its path.'),
  },
  {
    id: 'hunger', name: L('Hunger', 'Hunger'),
    re: /\b(hunger|hungry|devour|eat\b|feast|swallow|consume|maw\b|jaws\b|gorge|gluttony|food\b|famine|ravenous|wurm|ooze|eldrazi|annihilator|emerge|sacrifice another|exploit)/i,
    stats: [
      N('consumed', 'Verschlungene Masse', 'Mass consumed', 'kg', (c) => g(c, 'consumed', 80 * 3 ** Math.min(12, c.mv), 0.4)),
      only(being, N('kcal', 'Kalorienbedarf pro Tag', 'Calories per day', 'kcal', (c) => g(c, 'kcal', 2500 * 2 ** Math.min(14, c.s), 0.3))),
      only(being, N('stomach', 'Magenvolumen', 'Stomach volume', 'liters', (c) => g(c, 'stomach', 3 * 1.9 ** Math.min(14, c.s), 0.3))),
      only(being, N('bite', 'Bissgröße', 'Bite size', 'm', (c) => g(c, 'biteSize', 0.1 * 1.4 ** Math.min(14, c.s), 0.3))),
    ],
    funny: [
      N('fridges', 'Geplünderte Speisekammern', 'Larders raided', 'count', (c) => Math.round(c.r('fridge').between(10, 500))),
      R('fullness', 'Sättigungsgefühl', 'Feeling of fullness', () => 1),
    ],
    hobby: [L('Buffets testen', 'Testing buffets'), L('Wettessen', 'Eating contests')],
    fear: [L('Diäten', 'Diets'), L('Leere Teller', 'Empty plates')],
    snack: [L('Alles', 'Everything'), L('Ganze Dinge, ungekaut', 'Whole things, unchewed'), L('Socken', 'Socks')],
    line: L('Ist eigentlich immer hungrig.', 'Is basically always hungry.'),
  },
  {
    id: 'music', name: L('Klang', 'Sound'),
    re: /\b(song\b|sing\b|bard|horn\b|roar|howl|scream|shout|shriek|music|choir|chant|drum\b|harp\b|lute\b|flute|melod|hymn|siren|wail|cry\b|echo\b|bell\b|whisper)/i,
    stats: [
      N('volume', 'Lautstärke', 'Loudness', 'db', (c) => g(c, 'volume', 70 + 6 * c.mv, 0.1)),
      N('range', 'Hörweite', 'Audible range', 'm', (c) => g(c, 'range', 200 * (1 + c.mv), 0.3)),
      N('pitch', 'Tonhöhe', 'Pitch', 'hz', (c) => g(c, 'pitch', 440, 0.6)),
    ],
    funny: [
      N('encores', 'Zugaben pro Auftritt', 'Encores per show', 'count', (c) => Math.round(c.r('encore').between(0, 7))),
      P('inTune', 'Trifft den Ton', 'Hits the note', (c) => c.r('tune').between(30, 98)),
    ],
    hobby: [L('Karaoke', 'Karaoke'), L('Mitternachtskonzerte', 'Midnight concerts')],
    fear: [L('Ohrstöpsel', 'Earplugs'), L('Stille', 'Silence')],
    snack: [L('Honig für die Stimme', 'Honey for the voice'), L('Halsbonbons', 'Throat sweets')],
    line: L('Ist meist zu hören, lange bevor es zu sehen ist.', 'Usually heard long before it is seen.'),
  },
  {
    id: 'mana', name: L('Magie', 'Magic'),
    re: /\b(mana\b|ritual|add \{|arcane|sorcer|wizard|mage\b|magic|aether|ether|spark\b|rune\b|glyph|sigil|copy target|prowess|magecraft)/i,
    stats: [
      N('manaFlow', 'Manafluss pro Stunde', 'Mana flow per hour', 'mana', (c) => g(c, 'manaFlow', 6 * (1 + c.mv), 0.3)),
      N('resonance', 'Arkane Resonanz', 'Arcane resonance', 'hz', (c) => g(c, 'resonance', 432, 0.5)),
      N('manaDensity', 'Manadichte', 'Mana density', 'manam3', (c) => g(c, 'manaDensity', 3 * (1 + c.mv) ** 1.5, 0.3)),
      only(being, N('spellsKnown', 'Bekannte Zauber', 'Spells known', 'count', (c) => Math.round(g(c, 'spellsKnown', 20 * (1 + c.mv) ** 1.3, 0.4)))),
      N('aura', 'Aura-Reichweite', 'Aura range', 'm', (c) => g(c, 'auraRange', 2 + 3 * c.mv)),
    ],
    funny: [
      N('misfires', 'Missglückte Zauber', 'Misfired spells', 'count', (c) => Math.round(c.r('misfire').between(1, 60))),
      R('sparkle', 'Glitzerfaktor', 'Sparkle factor', (c) => 5 + c.mv / 2),
    ],
    hobby: [L('Zauberformeln üben', 'Practising incantations'), L('Runen malen', 'Painting runes')],
    fear: [L('Antimagie', 'Antimagic'), L('Gegenzauber', 'Counterspells')],
    snack: [L('Pures Mana', 'Raw mana'), L('Kristallkekse', 'Crystal cookies')],
    line: L('Die Luft um es herum knistert vor Magie.', 'The air around it crackles with magic.'),
  },
  {
    id: 'machine', name: L('Mechanik', 'Machinery'),
    re: /\b(construct|golem|thopter|servo|myr|robot|automaton|clockwork|gear\b|cog\b|steam|engine|machine|mech\b|factory|foundry|forge|metal|iron\b|steel|brass|copper|darksteel|vehicle|crew\b|craft\b|fabricate|energy|improvise|contraption|gnome|artificer|living metal|convert)/i,
    stats: [
      N('powerOut', 'Leistung', 'Power output', 'hp', (c) => g(c, 'powerOut', 60 * 1.6 ** Math.min(12, c.pw || c.mv), 0.25)),
      N('gears', 'Zahnräder', 'Gears', 'count', (c) => Math.round(g(c, 'gears', 40 * (1 + c.mv) ** 1.7, 0.4))),
      N('hours', 'Betriebsstunden', 'Operating hours', 'count', (c) => Math.round(c.r('hours').between(200, 90000))),
      N('oil', 'Ölverbrauch pro Tag', 'Oil per day', 'liters', (c) => g(c, 'oil', 0.5 + 0.8 * c.s, 0.4)),
    ],
    funny: [
      N('screws', 'Lose Schrauben', 'Loose screws', 'count', (c) => Math.round(c.r('screws').between(0, 14))),
      P('warranty', 'Garantie noch gültig', 'Warranty still valid', (c) => c.r('warr').between(2, 40)),
    ],
    hobby: [L('Selbstoptimierung', 'Self-optimisation'), L('Zahnräder ölen', 'Oiling gears'), L('Basteln', 'Tinkering')],
    fear: [L('Rost', 'Rust'), L('Magnete', 'Magnets'), L('Stromausfall', 'Power cuts')],
    snack: [L('Frisches Öl', 'Fresh oil'), L('Schrauben (knusprig)', 'Screws (crunchy)')],
    line: L('Tickt leise, wenn man genau hinhört.', 'Ticks quietly if you listen closely.'),
  },
  {
    id: 'vehicle', name: L('Fahrzeug', 'Vehicle'),
    re: /\b(vehicle|crew \d|pilot\b|racer\b|car\b|wagon\b|cart\b|carriage|chariot|ship\b|boat\b|galleon|skiff\b|airship|train\b|express|cycle\b|bike\b|truck\b|van\b|tank\b|sled\b|sleigh\b|spacecraft|starship)/i,
    stats: [
      N('trunk', 'Kofferraum', 'Boot space', 'liters', (c) => Math.round(g(c, 'trunk', 120 + 60 * c.tg, 0.4))),
      N('fuel', 'Verbrauch pro 100 km', 'Consumption per 100 km', 'mana', (c) => Math.max(0.5, g(c, 'fuel', 1 + c.mv * 1.2, 0.3))),
      N('horn', 'Hupe', 'Horn', 'db', (c) => Math.round(c.r('horn').between(95, 135))),
    ],
    funny: [
      N('parking', 'Parkplatzbedarf', 'Parking spaces needed', 'count', (c) => Math.max(1, Math.round(c.tg / 2))),
      N('scratches', 'Kratzer im Lack', 'Scratches in the paint', 'count', (c) => Math.round(c.r('scratch').between(0, 60))),
    ],
    hobby: [L('Ausfahrten', 'Joyrides'), L('Waschanlagen', 'Car washes')],
    fear: [L('Schlaglöcher', 'Potholes'), L('Abschleppwagen', 'Tow trucks'), L('Leere Tanks', 'Empty tanks')],
    snack: [L('Hochoktaniges Mana', 'High-octane mana'), L('Motoröl-Smoothie', 'Motor-oil smoothie')],
    line: L('Startet bei jedem Wetter.', 'Starts in any weather.'),
  },
  {
    id: 'goblin', name: L('Chaos', 'Chaos'),
    re: /\b(goblin|kobold|gremlin|explo|bomb|chaos|random|coin\b|flip|dice|die roll|roll a|gamble|mischief|prank|trickster|devil|imp\b|fling|reckless|madness|riot|anarch)/i,
    stats: [
      N('explosions', 'Verursachte Explosionen', 'Explosions caused', 'count', (c) => Math.round(g(c, 'explosions', 20 + 30 * c.mv, 0.5))),
      P('planSuccess', 'Pläne, die klappen', 'Plans that work', (c) => c.r('plan').between(2, 25)),
      N('blastRadiusG', 'Typischer Explosionsradius', 'Typical blast radius', 'm', (c) => g(c, 'blastG', 3 + 2 * c.mv, 0.4)),
    ],
    funny: [
      R('chaos', 'Chaosfaktor', 'Chaos factor', () => 9),
      N('eyebrows', 'Verbrannte Augenbrauen', 'Eyebrows singed', 'count', (c) => Math.round(c.r('brows').between(2, 40))),
    ],
    hobby: [L('Sprengen', 'Blowing things up'), L('Streiche', 'Pranks'), L('Würfelspiele', 'Dice games')],
    fear: [L('Langeweile', 'Boredom'), L('Gebrauchsanweisungen', 'Instruction manuals'), L('Ordnung', 'Tidiness')],
    snack: [L('Zündschnurlakritz', 'Fuse liquorice'), L('Was gerade herumliegt', 'Whatever is lying around')],
    line: L('Hat selten einen Plan und noch seltener einen zweiten.', 'Rarely has a plan, and even more rarely a second one.'),
  },
  {
    id: 'craft', name: L('Handwerk', 'Craft'),
    re: /\b(dwarf|smith\b|forge|anvil|hammer|mine\b|miner|dig\b|tunnel|craft\b|build|builder|mason|carpenter|brew\b|ale\b|beer\b|tavern|treasure token|food token|clue token|construct)/i,
    stats: [
      only((c) => !c.being, N('craftHours', 'Arbeitsstunden bis fertig', 'Hours to craft', 'count', (c) => Math.round(g(c, 'craftH', 20 * (1 + c.mv) ** 1.6, 0.4)))),
      N('forged', 'Geschmiedete Werkstücke', 'Items forged', 'count', (c) => Math.round(g(c, 'forged', 300 * (1 + c.mv), 0.4))),
      only(being, N('digDepth', 'Grabtiefe', 'Digging depth', 'm', (c) => g(c, 'digDepth', 30 + 25 * c.s, 0.4))),
      only(being, N('hammer', 'Hammergewicht', 'Hammer weight', 'kg', (c) => g(c, 'hammer', 2 + c.pw, 0.3))),
    ],
    funny: [
      N('ale', 'Bier pro Feierabend', 'Ale per evening', 'liters', (c) => g(c, 'ale', 2.5, 0.4)),
      N('thumbs', 'Getroffene Daumen', 'Thumbs hit', 'count', (c) => Math.round(c.r('thumbs').between(5, 200))),
    ],
    hobby: [L('Schmieden', 'Smithing'), L('Bierbrauen', 'Brewing'), L('Stollen graben', 'Digging tunnels')],
    fear: [L('Pfusch', 'Shoddy work'), L('Stumpfe Werkzeuge', 'Blunt tools')],
    snack: [L('Bergmannsbrot', 'Miner’s bread'), L('Starkbier', 'Strong ale')],
    line: L('Kann fast alles reparieren, außer der eigenen Laune.', 'Can fix almost anything except its own mood.'),
  },
  {
    id: 'pirate', name: L('Piraterie', 'Piracy'),
    re: /\b(pirate|corsair|buccaneer|privateer|raid\b|plunder|loot\b|treasure|cutlass|parrot|captain|smuggl|bounty|outlaw|bandit|thief|steal)/i,
    stats: [
      N('plundered', 'Gekaperte Schiffe', 'Ships plundered', 'count', (c) => Math.round(c.r('plund').between(2, 40 + 10 * c.mv))),
      N('bounty', 'Kopfgeld', 'Bounty', 'count', (c) => Math.round(g(c, 'bounty', 500 * 2 ** Math.min(10, c.mv), 0.5))),
      N('maps', 'Schatzkarten', 'Treasure maps', 'count', (c) => Math.round(c.r('maps').between(1, 12))),
    ],
    funny: [
      N('rum', 'Rum pro Woche', 'Rum per week', 'liters', (c) => g(c, 'rum', 3, 0.5)),
      R('honesty', 'Ehrlichkeit', 'Honesty', () => 2),
    ],
    hobby: [L('Schatzsuche', 'Treasure hunting'), L('Seemannsgarn spinnen', 'Telling tall tales')],
    fear: [L('Die Marine', 'The navy'), L('Skorbut', 'Scurvy'), L('Ehrliche Arbeit', 'Honest work')],
    snack: [L('Zwieback mit Rum', 'Hardtack with rum'), L('Limetten gegen Skorbut', 'Limes against scurvy')],
    line: L('Was nicht festgenagelt ist, gehört ihm.', 'Whatever is not nailed down belongs to it.'),
  },
  {
    id: 'demon', name: L('Pakt', 'Pact'),
    re: /\b(demon|devil|pact\b|bargain|contract|tempt|corrupt|infernal|hell\b|damn\b|fiend|soul\b|tribute|price\b|pay \d+ life)/i,
    stats: [
      N('soulsOwed', 'Geschuldete Seelen', 'Souls owed', 'count', (c) => Math.round(g(c, 'owed', 5 * (1 + c.mv) ** 1.5, 0.5))),
      N('pacts', 'Unterzeichnete Pakte', 'Pacts signed', 'count', (c) => Math.round(g(c, 'pacts', 30 * (1 + c.mv) ** 1.5, 0.4))),
      only(being, N('hornLength', 'Hornlänge', 'Horn length', 'm', (c) => g(c, 'hornLength', 0.2 + 0.08 * c.s, 0.3))),
      N('sulphur', 'Schwefelgeruch', 'Sulphur smell', 'ppm', (c) => g(c, 'sulphur', 40 + 20 * c.mv, 0.4)),
    ],
    funny: [
      N('fineprint', 'Seiten Kleingedrucktes', 'Pages of fine print', 'count', (c) => Math.round(c.r('fine').between(20, 900))),
      P('loopholes', 'Verträge mit Hintertür', 'Contracts with loopholes', () => 99),
    ],
    hobby: [L('Verträge aufsetzen', 'Drafting contracts'), L('Seelen sammeln', 'Collecting souls')],
    fear: [L('Anwälte', 'Lawyers'), L('Weihwasser', 'Holy water')],
    snack: [L('Schwefelbonbons', 'Brimstone drops'), L('Gebrochene Versprechen', 'Broken promises')],
    line: L('Bietet gern Hilfe an, zu sehr fairen Bedingungen. Angeblich.', 'Happy to help, on very fair terms. Allegedly.'),
  },
  {
    id: 'beast', name: L('Wildnis', 'Wilds'),
    re: /\b(beast|cat\b|lion\b|tiger|panther|wolf\b|wolves|werewolf|bear\b|boar\b|elk\b|stag\b|deer\b|horse\b|dog\b|hound\b|fox\b|ape\b|monkey|rat\b|mouse|squirrel|rabbit|hare\b|badger|otter|raccoon|hyena|jackal|dinosaur|hydra|basilisk|lizard|frog\b|toad\b|bat\b|elephant|rhino|ox\b|goat\b|sheep\b|bull\b|unicorn|chimera|manticore|predator|prey\b|hunt\b|pack\b|fight\b|claw\b|fang\b|tusk\b|horn\b|antler|mane\b|fur\b|paw\b)/i,
    stats: [
      only(being, N('naps2', 'Ruhepuls', 'Resting pulse', 'bpm', (c) => g(c, 'pulse', 90 / Math.sqrt(1 + c.s), 0.2))),
      only(being, N('biteForce', 'Beißkraft', 'Bite force', 'newton', (c) => g(c, 'biteForce', 600 * 1.7 ** Math.min(12, c.pw), 0.3))),
      only(moving, N('runSpeed', 'Laufgeschwindigkeit', 'Running speed', 'kmh', (c) => g(c, 'runSpeed', 25 + 8 * c.pw, 0.2))),
      only(being, N('territory', 'Revier', 'Territory', 'km2', (c) => g(c, 'territory', 2 + 4 * c.s, 0.5))),
      only(being, N('smellRange', 'Riechweite', 'Smell range', 'm', (c) => g(c, 'smellRange', 800 + 300 * c.s, 0.4))),
    ],
    funny: [
      N('naps', 'Nickerchen pro Tag', 'Naps per day', 'count', (c) => Math.round(c.r('naps').between(1, 8))),
      R('fetch', 'Stöckchen-Begeisterung', 'Enthusiasm for fetch', (c) => c.r('fetch').between(1, 10)),
    ],
    hobby: [L('Jagen', 'Hunting'), L('Revier markieren', 'Marking territory'), L('Mondheulen', 'Howling at the moon')],
    fear: [L('Tierärzte', 'Vets'), L('Badewannen', 'Bathtubs'), L('Staubsauger', 'Vacuum cleaners')],
    snack: [L('Was gerade vorbeiläuft', 'Whatever walks by'), L('Beeren und Abenteurer', 'Berries and adventurers')],
    line: L('Wittert Eindringlinge schon aus großer Entfernung.', 'Smells intruders from far away.'),
  },
  {
    id: 'healing', name: L('Heilung', 'Healing'),
    re: /\b(heal|healer|medic|cure\b|mend\b|restor|remedy|potion|salve|herb\b|nurse|doctor|rescue|save\b|protect|prevent all|gain \d+ life|lifelink)/i,
    stats: [
      N('healed', 'Geheilte Patienten', 'Patients healed', 'count', (c) => Math.round(g(c, 'healed', 120 * (1 + c.mv) ** 1.4, 0.4))),
      N('healRate', 'Heilrate', 'Healing rate', 'hpmin', (c) => g(c, 'healRate', 2 + 2 * c.mv, 0.3)),
      only(being, N('bandages', 'Verbände im Gepäck', 'Bandages carried', 'count', (c) => Math.round(c.r('band').between(5, 60)))),
    ],
    funny: [R('bedside', 'Einfühlsamkeit', 'Bedside manner', (c) => 6 + c.r('bed').between(0, 4))],
    hobby: [L('Kräutertee aufgießen', 'Brewing herbal tea'), L('Pflaster kleben', 'Applying plasters')],
    fear: [L('Unheilbares', 'The incurable'), L('Leere Apotheken', 'Empty apothecaries')],
    snack: [L('Hühnersuppe', 'Chicken soup'), L('Kamillentee', 'Camomile tea')],
    line: L('Taucht genau dann auf, wenn jemand verletzt ist.', 'Shows up exactly when someone is hurt.'),
  },
  {
    id: 'eldritch', name: L('Unbegreifliches', 'Eldritch'),
    re: /\b(eldrazi|horror|tentacle|aberration|annihilator|devoid|colorless|void\b|madness|insan|eldritch|otherworld|blind eternit|ingest|emerge|nightmare|phyrexian|compleat|oil\b|corrupt|mutate|mutant|abomination|spawn|scion)/i,
    stats: [
      N('dimensions', 'Wahrgenommene Dimensionen', 'Dimensions perceived', 'count', (c) => Math.round(c.r('dims').between(4, 11))),
      P('sanity', 'Verlorener Verstand beim Anblick', 'Sanity lost on sight', (c) => c.r('sanity').between(20, 60) + c.mv * 3),
      only(being, N('tentacles', 'Tentakel', 'Tentacles', 'count', (c) => Math.round(g(c, 'tentacles', 4 + 3 * c.s, 0.5)))),
    ],
    funny: [R('cuddleEld', 'Knuddelbarkeit', 'Huggability', () => 0)],
    hobby: [L('Realität verbiegen', 'Bending reality'), L('Ebenen verschlingen', 'Devouring planes')],
    fear: [L('Siegel und Bannkreise', 'Seals and wards'), L('Nichts, eigentlich', 'Nothing, really')],
    snack: [L('Realität', 'Reality'), L('Ganze Ebenen', 'Entire planes')],
    line: L('Wer zu lange hinsieht, vergisst seinen eigenen Namen.', 'Look too long and you forget your own name.'),
  },
  {
    id: 'faerie', name: L('Feenzauber', 'Fey'),
    re: /\b(faerie|fairy|fae\b|sprite|pixie|fey\b|wisp|glimmer|whimsy|enchanted|eldraine|trickster|tiny\b)/i,
    stats: [
      only((c) => !c.being, N('sparkles', 'Funkeln pro Minute', 'Sparkles per minute', 'count', (c) => Math.round(g(c, 'sparkles', 120, 0.5)))),
      only(being, N('glitter', 'Feenstaub pro Flügelschlag', 'Fairy dust per wingbeat', 'mg', (c) => g(c, 'glitter', 3, 0.5))),
      only(winged, N('wingbeats', 'Flügelschläge pro Sekunde', 'Wingbeats per second', 'count', (c) => Math.round(g(c, 'wingbeats', 60, 0.4)))),
    ],
    funny: [
      N('stolenSpoons', 'Gestohlene Teelöffel', 'Teaspoons stolen', 'count', (c) => Math.round(c.r('spoons').between(3, 150))),
      R('mischief', 'Unfug-Faktor', 'Mischief factor', () => 8),
    ],
    hobby: [L('Wünsche verdrehen', 'Twisting wishes'), L('Pilzkreise tanzen', 'Dancing in fairy rings')],
    fear: [L('Kaltes Eisen', 'Cold iron'), L('Spinnweben', 'Cobwebs')],
    snack: [L('Tautropfen', 'Dewdrops'), L('Gestohlene Geheimnisse', 'Stolen secrets')],
    line: L('Lacht leise, kurz bevor etwas verschwindet.', 'Giggles softly just before something goes missing.'),
  },
  {
    id: 'travel', name: L('Reise', 'Travel'),
    re: /\b(planeswalker|walker\b|travel|journey|explore|discover|venture|dungeon|map\b|wander|nomad|pilgrim|scout\b|ranger\b|expedition|landfall|portal|gate\b|teleport|blink\b|phase out|exile .* return|wanderer|voyage)/i,
    stats: [
      N('distance', 'Zurückgelegte Strecke', 'Distance travelled', 'km', (c) => g(c, 'distance', 3000 * (1 + c.mv) ** 1.5, 0.5)),
      N('planes', 'Besuchte Ebenen', 'Planes visited', 'count', (c) => Math.max(1, Math.round(c.r('planes').between(1, 4 + 3 * c.mv)))),
      N('stamps', 'Stempel im Reisepass', 'Passport stamps', 'count', (c) => Math.round(c.r('stamps').between(5, 300))),
    ],
    funny: [N('souvenirs', 'Souvenirs', 'Souvenirs', 'count', (c) => Math.round(c.r('souv').between(10, 400)))],
    hobby: [L('Postkarten schreiben', 'Writing postcards'), L('Landkarten zeichnen', 'Drawing maps')],
    fear: [L('Heimweh', 'Homesickness'), L('Verpasste Portale', 'Missed portals')],
    snack: [L('Reiseproviant', 'Trail rations'), L('Exotische Früchte', 'Exotic fruit')],
    line: L('Bleibt selten lange an einem Ort.', 'Rarely stays in one place for long.'),
  },
  {
    id: 'growth', name: L('Wachstum', 'Growth'),
    re: /\+1\/\+1 counter|\bgrow|\bevolve|\badapt|\bmonstros|\bproliferat|\bscale|\bbigger|\bswell|\bgets \+\d+\/\+\d+/i,
    stats: [
      only((c) => !c.being, N('boost', 'Wachstumsschub', 'Growth boost', 'percent', (c) => Math.min(400, Math.round(g(c, 'boost', 25 * (1 + c.mv), 0.3))))),
      only(being, N('growthRate', 'Wachstum pro Tag', 'Growth per day', 'm', (c) => g(c, 'growthRate', 0.05 + 0.03 * c.s, 0.4))),
      only(being, P('maxSize', 'Erreichte Endgröße', 'Of final size reached', (c) => c.r('maxSize').between(20, 70))),
    ],
    funny: [N('clothes', 'Zu klein gewordene Rüstungen', 'Outgrown suits of armour', 'count', (c) => Math.round(c.r('clothes').between(2, 30)))],
    hobby: [L('Muskeln zählen', 'Counting muscles'), L('Sich messen', 'Measuring itself')],
    fear: [L('Schrumpfzauber', 'Shrinking spells'), L('Zu enge Türen', 'Narrow doors')],
    snack: [L('Proteinbrei', 'Protein porridge'), L('Wachstumstrank', 'Growth potion')],
    line: L('Wird mit jeder Begegnung ein Stück größer.', 'Gets a little bigger with every encounter.'),
  },
  {
    id: 'swarm', name: L('Schwarm', 'Swarm'),
    re: /\bcreate[sd]? .*tokens?|\btokens?\b|\bswarm|\bhorde|\bpack\b|\bflock|\bcolony|\bhive|\bbrood|\binsect|\bants?\b|\bbees?\b|\bsquadron|\bmyriad|\bpopulate|\bamass|\bfor each creature/i,
    stats: [
      N('members', 'Schwarmgröße', 'Swarm size', 'count', (c) => Math.round(g(c, 'members', 12 * (1 + (c.num(/create (\d+|x)/i) ?? c.mv)) ** 1.6, 0.4))),
      N('formation', 'Formationsabstand', 'Formation spacing', 'm', (c) => g(c, 'formation', 1.2, 0.4)),
    ],
    funny: [N('names', 'Namen, die es sich merken kann', 'Names it can remember', 'count', (c) => Math.round(c.r('names').between(0, 12)))],
    hobby: [L('Gruppenfotos', 'Group photos'), L('Synchronschwimmen', 'Synchronised swimming')],
    fear: [L('Einsamkeit', 'Loneliness'), L('Insektenspray', 'Bug spray')],
    snack: [L('Familienpackungen', 'Family packs'), L('Großküchen-Eintopf', 'Canteen stew')],
    line: L('Kommt selten allein.', 'Rarely comes alone.'),
  },
];

/** Colour fallbacks, so every card has at least one fitting theme. */
export const COLOR_THEME: Record<string, string> = { W: 'light', U: 'mind', B: 'death', R: 'fire', G: 'nature', colorless: 'machine', void: 'eldritch', land: 'travel' };
