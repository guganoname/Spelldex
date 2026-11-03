/**
 * Optional artwork hints: turns an English caption of the card art (from the in-browser vision
 * model, see apps/web/src/ai) into structured hints the dex generator can use. Pure string work,
 * no model here, so it is unit-testable and the generator stays deterministic for a given caption.
 */
import type { Loc } from './types.ts';

export type VehicleHint = 'racer' | 'land' | 'ship' | 'air' | 'space' | 'rail' | 'mech';
export type SceneKey =
  | 'forest' | 'mountain' | 'water' | 'sky' | 'city' | 'indoor' | 'fire' | 'ice' | 'night' | 'desert'
  | 'cave' | 'swamp' | 'grave' | 'plains' | 'storm';

export interface ArtSubject {
  key: string;
  name: Loc;
  /** Body table key for creatures (tables.ts BODIES). */
  body?: string;
  vehicle?: VehicleHint;
}

export interface ArtHints {
  /** The model's caption, kept for display ("what the AI saw"). */
  caption: string;
  subjects: ArtSubject[];
  scenes: SceneKey[];
  colors: Loc[];
  size: 'large' | 'small' | null;
  many: boolean;
}

const S = (re: RegExp, key: string, de: string, en: string, extra: Partial<ArtSubject> = {}) =>
  [re, { key, name: { de, en }, ...extra }] as const;

/** Order matters: more specific phrases first. */
const SUBJECTS: (readonly [RegExp, ArtSubject])[] = [
  S(/\brac(e|ing) ?car|sports car|race\b/, 'racecar', 'Rennwagen', 'Race car', { vehicle: 'racer' }),
  S(/\bvans?\b|\bambulance/, 'van', 'Transporter', 'Van', { vehicle: 'land' }),
  S(/\btrucks?\b|\blorry/, 'truck', 'Lastwagen', 'Truck', { vehicle: 'land' }),
  S(/\bcars?\b|\bautomobile|\bjeep/, 'car', 'Auto', 'Car', { vehicle: 'land' }),
  S(/\bbus\b/, 'bus', 'Bus', 'Bus', { vehicle: 'land' }),
  S(/\bmotorcycle|\bbike\b/, 'motorcycle', 'Motorrad', 'Motorcycle', { vehicle: 'racer' }),
  S(/\btanks?\b/, 'tank', 'Panzer', 'Tank', { vehicle: 'land' }),
  S(/\bcarriage|\bcart\b|\bwagon/, 'carriage', 'Kutsche', 'Carriage', { vehicle: 'land' }),
  S(/\btrains?\b|\blocomotive/, 'train', 'Zug', 'Train', { vehicle: 'rail' }),
  S(/\bspace ?ships?|\bspacecraft|\brocket|\bstarship/, 'spaceship', 'Raumschiff', 'Spaceship', { vehicle: 'space' }),
  S(/\bairships?|\bzeppelin|\bblimp/, 'airship', 'Luftschiff', 'Airship', { vehicle: 'air' }),
  S(/\bairplane|\bplane\b|\baircraft|\bhelicopter|\bjet\b/, 'aircraft', 'Fluggerät', 'Aircraft', { vehicle: 'air' }),
  S(/\bships?\b|\bboats?\b|\bgalleon|\bsailboat|\bvessel/, 'ship', 'Schiff', 'Ship', { vehicle: 'ship' }),
  S(/\brobots?\b|\bmech\b|\bandroid|\bcyborg/, 'robot', 'Roboter', 'Robot', { body: 'Robot' }),
  S(/\bmachine|\bautomaton|\bclockwork/, 'machine', 'Maschine', 'Machine', { body: 'Construct' }),
  S(/\bdragons?\b/, 'dragon', 'Drache', 'Dragon', { body: 'Dragon' }),
  S(/\bdinosaur|\bt-?rex/, 'dinosaur', 'Dinosaurier', 'Dinosaur', { body: 'Dinosaur' }),
  S(/\breptile|\blizard|\bsalamander/, 'reptile', 'Reptil', 'Reptile', { body: 'Lizard' }),
  S(/\bsnakes?\b|\bserpent/, 'snake', 'Schlange', 'Snake', { body: 'Snake' }),
  S(/\blions?\b|\btigers?\b|\bpanther|\bleopard|\bcats?\b/, 'cat', 'Raubkatze', 'Big cat', { body: 'Cat' }),
  S(/\bwol(f|ves)\b/, 'wolf', 'Wolf', 'Wolf', { body: 'Wolf' }),
  S(/\bdogs?\b|\bhound/, 'dog', 'Hund', 'Dog', { body: 'Dog' }),
  S(/\bfox(es)?\b/, 'fox', 'Fuchs', 'Fox', { body: 'Fox' }),
  S(/\bbears?\b/, 'bear', 'Bär', 'Bear', { body: 'Bear' }),
  S(/\bhorses?\b|\bstallion/, 'horse', 'Pferd', 'Horse', { body: 'Horse' }),
  S(/\belephants?\b|\bmammoth/, 'elephant', 'Elefant', 'Elephant', { body: 'Elephant' }),
  S(/\b(rat|mouse|mice|rodent)s?\b/, 'rodent', 'Nager', 'Rodent', { body: 'Rat' }),
  S(/\b(owl|eagle|hawk|crow|raven|bird|parrot)s?\b/, 'bird', 'Vogel', 'Bird', { body: 'Bird' }),
  S(/\bbats?\b/, 'bat', 'Fledermaus', 'Bat', { body: 'Bat' }),
  S(/\b(shark)s?\b/, 'shark', 'Hai', 'Shark', { body: 'Shark' }),
  S(/\bwhales?\b/, 'whale', 'Wal', 'Whale', { body: 'Whale' }),
  S(/\boctop(us|i)|\bsquid|\btentacle/, 'octopus', 'Krake', 'Octopus', { body: 'Octopus' }),
  S(/\bfish(es)?\b/, 'fish', 'Fisch', 'Fish', { body: 'Fish' }),
  S(/\bcrabs?\b/, 'crab', 'Krabbe', 'Crab', { body: 'Crab' }),
  S(/\bspiders?\b/, 'spider', 'Spinne', 'Spider', { body: 'Spider' }),
  S(/\b(insect|bug|beetle|ant|wasp|bee)s?\b/, 'insect', 'Insekt', 'Insect', { body: 'Insect' }),
  S(/\bskeletons?\b|\bskulls?\b/, 'skeleton', 'Skelett', 'Skeleton', { body: 'Skeleton' }),
  S(/\bzombies?\b|\bcorpse/, 'zombie', 'Zombie', 'Zombie', { body: 'Zombie' }),
  S(/\bghosts?\b|\bspirits?\b|\bphantom/, 'ghost', 'Geist', 'Ghost', { body: 'Spirit' }),
  S(/\bangels?\b/, 'angel', 'Engel', 'Angel', { body: 'Angel' }),
  S(/\bdemons?\b|\bdevil/, 'demon', 'Dämon', 'Demon', { body: 'Demon' }),
  S(/\bgiants?\b|\bogre|\btroll/, 'giant', 'Riese', 'Giant', { body: 'Giant' }),
  S(/\btrees?\b/, 'tree', 'Baum', 'Tree', { body: 'Treefolk' }),
  S(/\bmushrooms?\b|\bfung(us|i)/, 'mushroom', 'Pilz', 'Mushroom', { body: 'Fungus' }),
  S(/\bflowers?\b|\bplants?\b|\bvines?\b/, 'plant', 'Pflanze', 'Plant', { body: 'Plant' }),
  S(/\bmonsters?\b|\bcreature|\bbeast/, 'monster', 'Ungeheuer', 'Monster', { body: 'Beast' }),
  S(/\bknights?\b|\bsoldiers?\b|\bwarriors?\b|\barmou?r\b/, 'warrior', 'Krieger', 'Warrior', { body: 'Human' }),
  S(/\bwizards?\b|\bwitch|\bsorcerer|\bmage\b/, 'wizard', 'Magier', 'Wizard', { body: 'Human' }),
  S(/\bwom[ae]n\b|\bgirl|\blady/, 'woman', 'Frau', 'Woman', { body: 'Human' }),
  S(/\bm[ae]n\b|\bhumans?\b|\bboy|\bperson|\bpeople|\bfigure/, 'person', 'Person', 'Person', { body: 'Human' }),
  S(/\bswords?\b|\bblade/, 'sword', 'Schwert', 'Sword'),
  S(/\bguns?\b|\brifle|\bpistol/, 'gun', 'Waffe', 'Gun'),
  S(/\bcastle|\btower|\bfortress/, 'castle', 'Burg', 'Castle'),
  S(/\bcrystals?\b|\bgems?\b|\bjewel/, 'crystal', 'Kristall', 'Crystal'),
  S(/\bbooks?\b|\bscroll/, 'book', 'Buch', 'Book'),
];

const SCENES: [RegExp, SceneKey][] = [
  [/\bforest|\btrees\b|\bjungle|\bwoods\b/, 'forest'],
  [/\bmountains?\b|\bcliffs?\b|\bboulders?\b|\brocks?\b|\bpeak/, 'mountain'],
  [/\bocean|\bsea\b|\bwaves?\b|\bwater\b|\bbeach|\briver|\blake\b|\bunderwater/, 'water'],
  [/\bsky\b|\bclouds?\b|\bflying\b/, 'sky'],
  [/\bcity\b|\bbuildings?\b|\bstreets?\b|\btown\b|\bvillage|\bcastle|\btemple/, 'city'],
  [/\broom\b|\binside\b|\bindoors|\bhall\b|\barches|\bchamber|\bthrone/, 'indoor'],
  [/\bfire\b|\bflames?\b|\blava\b|\bsmoke\b|\bexplosion|\bburning/, 'fire'],
  [/\bsnow|\bice\b|\bicy\b|\bfrozen|\bglacier/, 'ice'],
  [/\bnight\b|\bmoon\b|\bstars\b|\bdark\b/, 'night'],
  [/\bdesert|\bsand\b|\bdunes?\b/, 'desert'],
  [/\bcave\b|\bcavern|\bunderground|\btunnel/, 'cave'],
  [/\bswamp|\bmarsh|\bbog\b|\bmud\b/, 'swamp'],
  [/\bgraveyard|\btomb|\bgraves?\b|\bcemetery|\bcoffin/, 'grave'],
  [/\bfield\b|\bgrass|\bmeadow|\bplains?\b|\bhills?\b/, 'plains'],
  [/\blightning|\bstorm|\bthunder/, 'storm'],
];

export const SCENE_HABITAT: Record<SceneKey, Loc> = {
  forest: { de: 'Dichte Wälder', en: 'Dense forests' },
  mountain: { de: 'Felsiges Gebirge', en: 'Rocky mountains' },
  water: { de: 'Gewässer und Küsten', en: 'Waters and coasts' },
  sky: { de: 'Der offene Himmel', en: 'The open sky' },
  city: { de: 'Städte und Bauwerke', en: 'Cities and buildings' },
  indoor: { de: 'Hallen und Gemächer', en: 'Halls and chambers' },
  fire: { de: 'Brennendes Land', en: 'Burning lands' },
  ice: { de: 'Eis und Schnee', en: 'Ice and snow' },
  night: { de: 'Die Nacht', en: 'The night' },
  desert: { de: 'Wüsten und Dünen', en: 'Deserts and dunes' },
  cave: { de: 'Höhlen und Tunnel', en: 'Caves and tunnels' },
  swamp: { de: 'Sümpfe', en: 'Swamps' },
  grave: { de: 'Friedhöfe und Grüfte', en: 'Graveyards and crypts' },
  plains: { de: 'Wiesen und Hügel', en: 'Meadows and hills' },
  storm: { de: 'Gewitterzonen', en: 'Storm zones' },
};

const COLORS: [RegExp, Loc][] = [
  [/\bred\b/, { de: 'rot', en: 'red' }], [/\bblue\b/, { de: 'blau', en: 'blue' }],
  [/\bgreen\b/, { de: 'grün', en: 'green' }], [/\byellow\b/, { de: 'gelb', en: 'yellow' }],
  [/\borange\b/, { de: 'orange', en: 'orange' }], [/\bpurple\b|\bviolet\b/, { de: 'violett', en: 'purple' }],
  [/\bpink\b/, { de: 'rosa', en: 'pink' }], [/\bblack\b/, { de: 'schwarz', en: 'black' }],
  [/\bwhite\b/, { de: 'weiß', en: 'white' }], [/\bgr[ae]y\b/, { de: 'grau', en: 'grey' }],
  [/\bbrown\b/, { de: 'braun', en: 'brown' }], [/\bgold(en)?\b/, { de: 'golden', en: 'golden' }],
  [/\bsilver\b/, { de: 'silbern', en: 'silver' }],
];

/** Parses a caption into hints. Colours are taken in caption order, subjects in table order. */
export function parseArtCaption(caption: string): ArtHints {
  const c = caption.toLowerCase();
  const subjects: ArtSubject[] = [];
  for (const [re, s] of SUBJECTS) if (re.test(c) && !subjects.some((x) => x.key === s.key)) subjects.push(s);
  const scenes = SCENES.filter(([re]) => re.test(c)).map(([, k]) => k);
  const colors = COLORS
    .map(([re, l]) => [c.search(re), l] as const)
    .filter(([i]) => i >= 0)
    .sort((a, b) => a[0] - b[0])
    .map(([, l]) => l);
  const size = /\b(huge|giant|enormous|massive|large|towering|big)\b/.test(c) ? 'large'
    : /\b(tiny|small|little)\b/.test(c) ? 'small' : null;
  const many = /\b(two|three|four|several|many|group|crowd|army|herd|pack|flock|swarm)\b/.test(c);
  return { caption, subjects, scenes, colors, size, many };
}
