/**
 * Lookup tables for the dex entry generator. Everything here is our own playful estimate, keyed by
 * MTG subtypes; nothing is copied from wikis. Sizes are for a creature of "reference" size (the
 * average of power and toughness given as `ref`), the generator scales them with the card's stats.
 */
import type { Color } from '../contracts/card.ts';
import type { Loc } from './types.ts';

export type BodyPlan =
  | 'dragon' | 'winged' | 'humanoid' | 'giant' | 'undead' | 'spirit' | 'beast' | 'bird' | 'aquatic'
  | 'serpent' | 'insect' | 'construct' | 'elemental' | 'plant' | 'ooze' | 'eldrazi' | 'horror' | 'divine' | 'tiny';

export interface Body {
  de: string;
  en: string;
  plan: BodyPlan;
  /** Height in metres (or body length for `long` bodies) at reference size. */
  h: number;
  /** Weight in kg at reference size. */
  kg: number;
  /** Average of power and toughness this size belongs to. */
  ref: number;
  long?: boolean;
}

const b = (de: string, en: string, plan: BodyPlan, h: number, kg: number, ref: number, long?: boolean): Body =>
  ({ de, en, plan, h, kg, ref, ...(long ? { long } : {}) });

/** Subtypes that describe a body (race/species). Classes like Wizard are in JOBS. */
export const BODIES: Record<string, Body> = {
  Dragon: b('Drache', 'Dragon', 'dragon', 16, 9000, 5, true),
  Drake: b('Drake', 'Drake', 'dragon', 5, 450, 2.5, true),
  Wyvern: b('Lindwurm', 'Wyvern', 'dragon', 7, 900, 3, true),
  Angel: b('Engel', 'Angel', 'winged', 2.3, 95, 4),
  Archon: b('Archont', 'Archon', 'winged', 3.5, 600, 5),
  Sphinx: b('Sphinx', 'Sphinx', 'winged', 4, 1800, 5),
  Demon: b('Dämon', 'Demon', 'winged', 4.5, 1200, 5),
  Devil: b('Teufel', 'Devil', 'humanoid', 1.2, 40, 1.5),
  Imp: b('Kobold', 'Imp', 'winged', 0.6, 6, 1),
  Gargoyle: b('Gargoyle', 'Gargoyle', 'winged', 1.8, 900, 3),
  Griffin: b('Greif', 'Griffin', 'winged', 2.2, 400, 2.5),
  Pegasus: b('Pegasus', 'Pegasus', 'winged', 1.7, 450, 2),
  Faerie: b('Feenwesen', 'Faerie', 'tiny', 0.15, 0.06, 1),
  Sprite: b('Sprite', 'Sprite', 'tiny', 0.12, 0.04, 1),

  Human: b('Mensch', 'Human', 'humanoid', 1.75, 75, 2),
  Elf: b('Elf', 'Elf', 'humanoid', 1.85, 64, 1.5),
  Dwarf: b('Zwerg', 'Dwarf', 'humanoid', 1.35, 82, 2),
  Goblin: b('Goblin', 'Goblin', 'humanoid', 1.0, 32, 1),
  Kithkin: b('Kithkin', 'Kithkin', 'humanoid', 1.1, 35, 1.5),
  Kor: b('Kor', 'Kor', 'humanoid', 1.95, 70, 2),
  Vedalken: b('Vedalken', 'Vedalken', 'humanoid', 1.95, 72, 2),
  Viashino: b('Viashino', 'Viashino', 'humanoid', 1.7, 85, 2),
  Orc: b('Ork', 'Orc', 'humanoid', 1.95, 120, 2.5),
  Halfling: b('Halbling', 'Halfling', 'humanoid', 1.05, 30, 1),
  Gnome: b('Gnom', 'Gnome', 'humanoid', 0.9, 25, 1),
  Leonin: b('Leonin', 'Leonin', 'humanoid', 2.0, 110, 2.5),
  Rhox: b('Rhox', 'Rhox', 'humanoid', 2.3, 260, 3.5),
  Loxodon: b('Loxodon', 'Loxodon', 'humanoid', 2.5, 380, 3.5),
  Minotaur: b('Minotaurus', 'Minotaur', 'humanoid', 2.4, 300, 3),
  Centaur: b('Zentaur', 'Centaur', 'humanoid', 2.3, 550, 3),
  Satyr: b('Satyr', 'Satyr', 'humanoid', 1.7, 70, 2),
  Aetherborn: b('Ätherwesen', 'Aetherborn', 'humanoid', 1.8, 40, 2),
  Aven: b('Avior', 'Aven', 'bird', 1.8, 55, 2),
  Naga: b('Naga', 'Naga', 'serpent', 4, 160, 3, true),
  Rat: b('Ratte', 'Rat', 'beast', 0.3, 0.6, 1, true),
  Mouse: b('Maus', 'Mouse', 'beast', 0.2, 0.3, 1.5, true),
  Raccoon: b('Waschbär', 'Raccoon', 'beast', 0.6, 8, 2, true),
  Otter: b('Otter', 'Otter', 'beast', 0.9, 9, 1.5, true),
  Squirrel: b('Eichhörnchen', 'Squirrel', 'beast', 0.25, 0.4, 1, true),
  Rabbit: b('Kaninchen', 'Rabbit', 'beast', 0.4, 2, 1, true),
  Frog: b('Frosch', 'Frog', 'beast', 0.2, 0.4, 1.5, true),
  Lizard: b('Echse', 'Lizard', 'beast', 1, 6, 1.5, true),
  Bat: b('Fledermaus', 'Bat', 'bird', 0.3, 0.5, 1),
  Bird: b('Vogel', 'Bird', 'bird', 0.5, 2, 1.5),
  Phoenix: b('Phönix', 'Phoenix', 'bird', 1.5, 12, 3),

  Giant: b('Riese', 'Giant', 'giant', 8, 9000, 4.5),
  Ogre: b('Oger', 'Ogre', 'giant', 3, 420, 3),
  Troll: b('Troll', 'Troll', 'giant', 3.2, 650, 3.5),
  Cyclops: b('Zyklop', 'Cyclops', 'giant', 6, 4000, 4.5),
  Titan: b('Titan', 'Titan', 'giant', 25, 200000, 8),

  Zombie: b('Zombie', 'Zombie', 'undead', 1.7, 55, 2),
  Skeleton: b('Skelett', 'Skeleton', 'undead', 1.75, 12, 1.5),
  Vampire: b('Vampir', 'Vampire', 'undead', 1.82, 68, 2.5),
  Mummy: b('Mumie', 'Mummy', 'undead', 1.65, 25, 2),
  Spirit: b('Geist', 'Spirit', 'spirit', 1.8, 0.021, 2),
  Specter: b('Gespenst', 'Specter', 'spirit', 2.2, 0.03, 2.5),
  Wraith: b('Schemen', 'Wraith', 'spirit', 2, 0.02, 2.5),
  Shade: b('Schatten', 'Shade', 'spirit', 1.8, 0.01, 1.5),
  Lich: b('Lich', 'Lich', 'undead', 1.8, 30, 3),

  Cat: b('Katze', 'Cat', 'beast', 1.1, 70, 2, true),
  Dog: b('Hund', 'Dog', 'beast', 0.9, 35, 2, true),
  Wolf: b('Wolf', 'Wolf', 'beast', 1.4, 55, 2, true),
  Fox: b('Fuchs', 'Fox', 'beast', 0.8, 7, 1.5, true),
  Bear: b('Bär', 'Bear', 'beast', 2.4, 420, 3.5),
  Boar: b('Eber', 'Boar', 'beast', 1.6, 180, 2.5, true),
  Ox: b('Ochse', 'Ox', 'beast', 2.6, 900, 3, true),
  Elk: b('Elch', 'Elk', 'beast', 2.4, 500, 3, true),
  Horse: b('Pferd', 'Horse', 'beast', 2.2, 500, 2.5, true),
  Unicorn: b('Einhorn', 'Unicorn', 'beast', 2.2, 450, 2.5, true),
  Elephant: b('Elefant', 'Elephant', 'beast', 3.3, 6000, 4),
  Mammoth: b('Mammut', 'Mammoth', 'beast', 4, 8000, 5),
  Rhino: b('Nashorn', 'Rhino', 'beast', 3.6, 2300, 4, true),
  Ape: b('Affe', 'Ape', 'beast', 1.7, 160, 2.5),
  Monkey: b('Äffchen', 'Monkey', 'beast', 0.5, 6, 1),
  Badger: b('Dachs', 'Badger', 'beast', 0.8, 12, 2, true),
  Hyena: b('Hyäne', 'Hyena', 'beast', 1.3, 60, 2, true),
  Jackal: b('Schakal', 'Jackal', 'beast', 0.9, 12, 1.5, true),
  Beast: b('Bestie', 'Beast', 'beast', 2.6, 700, 3.5),
  Dinosaur: b('Dinosaurier', 'Dinosaur', 'beast', 9, 6500, 5, true),
  Hydra: b('Hydra', 'Hydra', 'beast', 7, 4800, 4, true),
  Basilisk: b('Basilisk', 'Basilisk', 'beast', 3, 300, 2.5, true),
  Wurm: b('Wurm', 'Wurm', 'serpent', 30, 40000, 6, true),
  Snake: b('Schlange', 'Snake', 'serpent', 3, 25, 1.5, true),
  Salamander: b('Salamander', 'Salamander', 'beast', 1.2, 15, 2, true),
  Turtle: b('Schildkröte', 'Turtle', 'aquatic', 1.5, 300, 3, true),
  Crocodile: b('Krokodil', 'Crocodile', 'aquatic', 5, 700, 3, true),
  Manticore: b('Mantikor', 'Manticore', 'beast', 3, 700, 4, true),
  Chimera: b('Chimäre', 'Chimera', 'beast', 3.2, 800, 4, true),

  Merfolk: b('Meervolk', 'Merfolk', 'aquatic', 1.8, 90, 1.5),
  Fish: b('Fisch', 'Fish', 'aquatic', 1, 12, 1.5, true),
  Shark: b('Hai', 'Shark', 'aquatic', 5, 1100, 3, true),
  Whale: b('Wal', 'Whale', 'aquatic', 22, 60000, 6, true),
  Octopus: b('Krake', 'Octopus', 'aquatic', 3, 60, 2, true),
  Kraken: b('Kraken', 'Kraken', 'aquatic', 30, 25000, 7, true),
  Leviathan: b('Leviathan', 'Leviathan', 'aquatic', 70, 120000, 9, true),
  Crab: b('Krabbe', 'Crab', 'aquatic', 0.8, 15, 2),
  Serpent: b('Seeschlange', 'Serpent', 'serpent', 35, 18000, 6, true),
  Jellyfish: b('Qualle', 'Jellyfish', 'aquatic', 0.6, 2, 1),

  Insect: b('Insekt', 'Insect', 'insect', 1.2, 40, 1.5, true),
  Spider: b('Spinne', 'Spider', 'insect', 1.5, 60, 2.5, true),
  Scorpion: b('Skorpion', 'Scorpion', 'insect', 1.4, 45, 1.5, true),
  Beetle: b('Käfer', 'Beetle', 'insect', 1, 30, 1.5, true),
  Ant: b('Ameise', 'Ant', 'insect', 0.6, 4, 1, true),
  Bee: b('Biene', 'Bee', 'insect', 0.3, 0.4, 1, true),
  Worm: b('Wurm', 'Worm', 'serpent', 2, 15, 1.5, true),
  Slug: b('Schnecke', 'Slug', 'ooze', 1, 20, 1.5, true),

  Construct: b('Konstrukt', 'Construct', 'construct', 2.2, 900, 3),
  Golem: b('Golem', 'Golem', 'construct', 3.5, 2600, 4),
  Myr: b('Myr', 'Myr', 'construct', 0.6, 18, 1),
  Thopter: b('Thopter', 'Thopter', 'construct', 0.4, 3, 1),
  Servo: b('Servo', 'Servo', 'construct', 0.3, 2, 1),
  Robot: b('Roboter', 'Robot', 'construct', 6, 4500, 3.5),
  Juggernaut: b('Juggernaut', 'Juggernaut', 'construct', 4, 12000, 5),
  'Assembly-Worker': b('Montagearbeiter', 'Assembly-Worker', 'construct', 2.2, 400, 2),
  Gnoll: b('Gnoll', 'Gnoll', 'humanoid', 2, 95, 2),
  Scarecrow: b('Vogelscheuche', 'Scarecrow', 'construct', 1.9, 18, 2),
  Wall: b('Wall', 'Wall', 'construct', 4, 20000, 3),

  Elemental: b('Elementarwesen', 'Elemental', 'elemental', 3, 1200, 3.5),
  Avatar: b('Avatar', 'Avatar', 'divine', 5, 2500, 5),
  God: b('Gott', 'God', 'divine', 12, 9000, 5),
  Incarnation: b('Inkarnation', 'Incarnation', 'elemental', 4, 1500, 4),
  Djinn: b('Dschinn', 'Djinn', 'elemental', 3, 0.5, 4),
  Efreet: b('Ifrit', 'Efreet', 'elemental', 3, 0.8, 3),

  Treefolk: b('Baumvolk', 'Treefolk', 'plant', 9, 14000, 4),
  Plant: b('Pflanze', 'Plant', 'plant', 1, 15, 1),
  Fungus: b('Pilz', 'Fungus', 'plant', 0.8, 10, 1),
  Saproling: b('Saproling', 'Saproling', 'plant', 0.4, 2, 1),
  Dryad: b('Dryade', 'Dryad', 'plant', 1.9, 55, 2),
  Ooze: b('Schlick', 'Ooze', 'ooze', 1.5, 600, 2.5),

  Eldrazi: b('Eldrazi', 'Eldrazi', 'eldrazi', 40, 150000, 8),
  Horror: b('Schrecken', 'Horror', 'horror', 3, 450, 3),
  Nightmare: b('Albtraum', 'Nightmare', 'horror', 3, 50, 3),
  Phyrexian: b('Phyrexianer', 'Phyrexian', 'horror', 2.2, 300, 3),
  Illusion: b('Illusion', 'Illusion', 'spirit', 2, 0, 2),
};

/** Class/job subtypes shown as "occupation". */
export const JOBS: Record<string, Loc> = {
  Wizard: { de: 'Zauberer', en: 'Wizard' }, Warrior: { de: 'Krieger', en: 'Warrior' },
  Cleric: { de: 'Kleriker', en: 'Cleric' }, Rogue: { de: 'Schurke', en: 'Rogue' },
  Knight: { de: 'Ritter', en: 'Knight' }, Soldier: { de: 'Soldat', en: 'Soldier' },
  Shaman: { de: 'Schamane', en: 'Shaman' }, Druid: { de: 'Druide', en: 'Druid' },
  Warlock: { de: 'Hexenmeister', en: 'Warlock' }, Monk: { de: 'Mönch', en: 'Monk' },
  Berserker: { de: 'Berserker', en: 'Berserker' }, Archer: { de: 'Bogenschütze', en: 'Archer' },
  Assassin: { de: 'Assassine', en: 'Assassin' }, Pirate: { de: 'Pirat', en: 'Pirate' },
  Ninja: { de: 'Ninja', en: 'Ninja' }, Samurai: { de: 'Samurai', en: 'Samurai' },
  Scout: { de: 'Späher', en: 'Scout' }, Advisor: { de: 'Berater', en: 'Advisor' },
  Artificer: { de: 'Artefaktschmied', en: 'Artificer' }, Noble: { de: 'Adeliger', en: 'Noble' },
  Peasant: { de: 'Bauer', en: 'Peasant' }, Citizen: { de: 'Bürger', en: 'Citizen' },
  Detective: { de: 'Detektiv', en: 'Detective' }, Mercenary: { de: 'Söldner', en: 'Mercenary' },
  Bard: { de: 'Barde', en: 'Bard' }, Pilot: { de: 'Pilot', en: 'Pilot' },
  Ally: { de: 'Verbündeter', en: 'Ally' }, Survivor: { de: 'Überlebender', en: 'Survivor' },
  Medic: { de: 'Sanitäter', en: 'Medic' }, Rebel: { de: 'Rebell', en: 'Rebel' },
  Spellshaper: { de: 'Zauberformer', en: 'Spellshaper' }, Barbarian: { de: 'Barbar', en: 'Barbarian' },
  Ranger: { de: 'Waldläufer', en: 'Ranger' }, Sorcerer: { de: 'Hexer', en: 'Sorcerer' },
  Employee: { de: 'Angestellter', en: 'Employee' }, Coward: { de: 'Feigling', en: 'Coward' },
  Flagbearer: { de: 'Bannerträger', en: 'Flagbearer' }, Minion: { de: 'Scherge', en: 'Minion' },
  Performer: { de: 'Künstler', en: 'Performer' }, Townsfolk: { de: 'Dorfbewohner', en: 'Townsfolk' },
};

/** Pokédex-style category prefix by color ("Flame Dragon"). */
export const COLOR_ADJ: Record<Color | 'multi' | 'colorless', Loc> = {
  W: { de: 'Licht', en: 'Radiant' },
  U: { de: 'Gezeiten', en: 'Tidal' },
  B: { de: 'Schatten', en: 'Shadow' },
  R: { de: 'Flammen', en: 'Flame' },
  G: { de: 'Wildnis', en: 'Wild' },
  multi: { de: 'Prisma', en: 'Prismatic' },
  colorless: { de: 'Stahl', en: 'Steel' },
};

export const COLOR_HABITAT: Record<Color | 'colorless', Loc> = {
  W: { de: 'Weite Ebenen und Kathedralenstädte', en: 'Open plains and cathedral cities' },
  U: { de: 'Inselküsten und Nebelbänke', en: 'Island coasts and fog banks' },
  B: { de: 'Sümpfe, Grüfte und Friedhöfe', en: 'Swamps, crypts and graveyards' },
  R: { de: 'Berghänge und Vulkanschlote', en: 'Mountainsides and volcanic vents' },
  G: { de: 'Urwälder und wilde Täler', en: 'Primeval forests and wild valleys' },
  colorless: { de: 'Ruinen, Werkstätten und vergessene Gewölbe', en: 'Ruins, workshops and forgotten vaults' },
};

export const COLOR_MOOD: Record<Color | 'colorless', Loc[]> = {
  W: [{ de: 'pflichtbewusst', en: 'dutiful' }, { de: 'feierlich', en: 'solemn' }, { de: 'hilfsbereit', en: 'helpful' }],
  U: [{ de: 'nachdenklich', en: 'pensive' }, { de: 'neugierig', en: 'curious' }, { de: 'besserwisserisch', en: 'know-it-all' }],
  B: [{ de: 'ehrgeizig', en: 'ambitious' }, { de: 'grüblerisch', en: 'brooding' }, { de: 'hungrig', en: 'hungry' }],
  R: [{ de: 'aufbrausend', en: 'hot-headed' }, { de: 'übermütig', en: 'reckless' }, { de: 'begeistert', en: 'thrilled' }],
  G: [{ de: 'gelassen', en: 'serene' }, { de: 'verfressen', en: 'ravenous' }, { de: 'territorial', en: 'territorial' }],
  colorless: [{ de: 'stoisch', en: 'stoic' }, { de: 'unergründlich', en: 'inscrutable' }, { de: 'pflegeleicht', en: 'low-maintenance' }],
};

/** Favourite snack by body plan (pick deterministically). */
export const SNACKS: Record<BodyPlan, Loc[]> = {
  dragon: [{ de: 'Ritter in Dosen', en: 'Canned knights' }, { de: 'ganze Schafherden', en: 'Entire flocks of sheep' }, { de: 'Goldmünzen (nur zum Anschauen)', en: 'Gold coins (just for looking)' }],
  winged: [{ de: 'Wolkenkuchen', en: 'Cloud cake' }, { de: 'Gebete mit Honig', en: 'Prayers with honey' }],
  humanoid: [{ de: 'Eintopf vom Vortag', en: "Yesterday's stew" }, { de: 'Brot mit zu viel Butter', en: 'Bread with too much butter' }, { de: 'Gasthausfrühstück', en: 'Tavern breakfast' }],
  giant: [{ de: 'Felsbrocken an Kiefernnadeln', en: 'Boulders on pine needles' }, { de: 'Ein Fass Bier, mit Fass', en: 'A barrel of ale, barrel included' }],
  undead: [{ de: 'Gehirn (bio)', en: 'Brains (organic)' }, { de: 'Staub und Erinnerungen', en: 'Dust and memories' }],
  spirit: [{ de: 'Kerzenlicht', en: 'Candlelight' }, { de: 'Seufzer', en: 'Sighs' }],
  beast: [{ de: 'Was gerade vorbeiläuft', en: 'Whatever walks by' }, { de: 'Beeren und Abenteurer', en: 'Berries and adventurers' }],
  bird: [{ de: 'Glänzende Dinge', en: 'Shiny things' }, { de: 'Würmer à la carte', en: 'Worms à la carte' }],
  aquatic: [{ de: 'Seetang-Sushi', en: 'Kelp sushi' }, { de: 'Schiffbrüchige Kekse', en: 'Shipwrecked biscuits' }],
  serpent: [{ de: 'Ganze Dinge, ungekaut', en: 'Whole things, unchewed' }, { de: 'Eier', en: 'Eggs' }],
  insect: [{ de: 'Zuckerreste', en: 'Sugar crumbs' }, { de: 'Die Ernte von nebenan', en: "The neighbour's harvest" }],
  construct: [{ de: 'Frisches Öl', en: 'Fresh oil' }, { de: 'Schrauben (knusprig)', en: 'Screws (crunchy)' }],
  elemental: [{ de: 'Pures Mana', en: 'Raw mana' }, { de: 'Gewitter', en: 'Thunderstorms' }],
  plant: [{ de: 'Sonnenlicht', en: 'Sunlight' }, { de: 'Regenwasser', en: 'Rainwater' }, { de: 'Kompost', en: 'Compost' }],
  ooze: [{ de: 'Alles', en: 'Everything' }, { de: 'Socken', en: 'Socks' }],
  eldrazi: [{ de: 'Ganze Ebenen', en: 'Entire planes' }, { de: 'Realität', en: 'Reality' }],
  horror: [{ de: 'Albträume', en: 'Nightmares' }, { de: 'Fingernägel', en: 'Fingernails' }],
  divine: [{ de: 'Verehrung', en: 'Worship' }, { de: 'Ambrosia', en: 'Ambrosia' }],
  tiny: [{ de: 'Tautropfen', en: 'Dewdrops' }, { de: 'Gestohlene Geheimnisse', en: 'Stolen secrets' }],
};

/** Ordinary lifespan in years at reference rarity, by plan. */
export const LIFESPAN: Record<BodyPlan, number> = {
  dragon: 2500, winged: 900, humanoid: 80, giant: 400, undead: 300, spirit: 600, beast: 25, bird: 15,
  aquatic: 60, serpent: 120, insect: 2, construct: 150, elemental: 5000, plant: 800, ooze: 40,
  eldrazi: 10000, horror: 50, divine: 9000, tiny: 200,
};
