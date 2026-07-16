export type ItemKind =
  | "vitality-fruit"
  | "med-kit"
  | "power-orb"
  | "wind-boots"
  | "iron-ward"
  | "nova-star"
  | "plasma-blade"
  | "power-bat"
  | "pulse-blaster"
  | "flame-sprayer"
  | "blast-core"
  | "ricochet-disc"
  | "slick-gel"
  | "proximity-mine"
  | "rebound-pad"
  | "snare-trap"
  | "shock-seed"
  | "smoke-bomb"
  | "reflector-charm"
  | "time-dilator";

export type ItemEffect =
  | "heal-small"
  | "heal-large"
  | "power-up"
  | "speed-up"
  | "armor"
  | "invincibility"
  | "sword"
  | "bat"
  | "ray"
  | "flame"
  | "bomb"
  | "shell"
  | "slip-trap"
  | "proximity-bomb"
  | "bumper"
  | "bury"
  | "stun"
  | "smoke"
  | "projectile-shield"
  | "slow-time";

export interface ItemDefinition {
  label: string;
  category: "auto" | "weapon" | "throwable" | "trap";
  effect: ItemEffect;
  amount: number;
  duration: number;
  charges: number;
  color: string;
  iconUrl: string;
}

interface PrivateItemPresentation {
  label: string;
  asset: string;
}

const PRIVATE_ITEM_PRESENTATION: Readonly<Record<ItemKind, PrivateItemPresentation>> = {
  "vitality-fruit": { label: "Maxim Tomato", asset: "maxim-tomato" },
  "med-kit": { label: "Heart Container", asset: "heart-container" },
  "power-orb": { label: "Super Mushroom", asset: "super-mushroom" },
  "wind-boots": { label: "Bunny Hood", asset: "bunny-hood" },
  "iron-ward": { label: "Metal Box", asset: "metal-box" },
  "nova-star": { label: "Star", asset: "super-star" },
  "plasma-blade": { label: "Beam Sword", asset: "beam-sword" },
  "power-bat": { label: "Home-Run Bat", asset: "home-run-bat" },
  "pulse-blaster": { label: "Ray Gun", asset: "ray-gun" },
  "flame-sprayer": { label: "Fire Flower", asset: "fire-flower" },
  "blast-core": { label: "Bob-omb", asset: "bob-omb" },
  "ricochet-disc": { label: "Green Shell", asset: "green-shell" },
  "slick-gel": { label: "Banana Peel", asset: "banana-peel" },
  "proximity-mine": { label: "Proximity Mine", asset: "motion-sensor-bomb" },
  "rebound-pad": { label: "Bumper", asset: "bumper" },
  "snare-trap": { label: "Pitfall", asset: "pitfall" },
  "shock-seed": { label: "Deku Nut", asset: "deku-nut" },
  "smoke-bomb": { label: "Smoke Ball", asset: "smoke-ball" },
  "reflector-charm": { label: "Franklin Badge", asset: "franklin-badge" },
  "time-dilator": { label: "Timer", asset: "timer" },
};

const item = (
  label: string,
  category: ItemDefinition["category"],
  effect: ItemEffect,
  amount: number,
  duration: number,
  charges: number,
  color: string,
  id: ItemKind,
): ItemDefinition => {
  const privatePresentation = PRIVATE_ITEM_PRESENTATION[id];
  return {
    label: __PRIVATE_CONTENT_MODE__ ? privatePresentation.label : label,
    category,
    effect,
    amount,
    duration,
    charges,
    color,
    iconUrl: __PRIVATE_CONTENT_MODE__
      ? `/assets/items/${privatePresentation.asset}.png`
      : `/assets/open/items/${id}.svg`,
  };
};

export const ITEM_DEFINITIONS: Readonly<Record<ItemKind, ItemDefinition>> = {
  "vitality-fruit": item("Vitality Fruit", "auto", "heal-small", 30, 0, 1, "#ef3a35", "vitality-fruit"),
  "med-kit": item("Med Kit", "auto", "heal-large", 60, 0, 1, "#ff6e8b", "med-kit"),
  "power-orb": item("Power Orb", "auto", "power-up", 1.25, 600, 1, "#e54337", "power-orb"),
  "wind-boots": item("Wind Boots", "auto", "speed-up", 1.38, 600, 1, "#ffe38a", "wind-boots"),
  "iron-ward": item("Iron Ward", "auto", "armor", 0.68, 540, 1, "#aeb7c4", "iron-ward"),
  "nova-star": item("Nova Star", "auto", "invincibility", 1, 360, 1, "#ffe735", "nova-star"),
  "plasma-blade": item("Plasma Blade", "weapon", "sword", 11, 0, 6, "#61d7ff", "plasma-blade"),
  "power-bat": item("Power Bat", "weapon", "bat", 18, 0, 3, "#f4c683", "power-bat"),
  "pulse-blaster": item("Pulse Blaster", "weapon", "ray", 7, 0, 8, "#72f5ff", "pulse-blaster"),
  "flame-sprayer": item("Flame Sprayer", "weapon", "flame", 5, 0, 10, "#ff713e", "flame-sprayer"),
  "blast-core": item("Blast Core", "throwable", "bomb", 20, 90, 1, "#27233c", "blast-core"),
  "ricochet-disc": item("Ricochet Disc", "throwable", "shell", 12, 360, 1, "#4cc64c", "ricochet-disc"),
  "slick-gel": item("Slick Gel", "trap", "slip-trap", 5, 720, 1, "#ffe350", "slick-gel"),
  "proximity-mine": item("Proximity Mine", "trap", "proximity-bomb", 16, 720, 1, "#ed4d4d", "proximity-mine"),
  "rebound-pad": item("Rebound Pad", "trap", "bumper", 9, 720, 1, "#e95b80", "rebound-pad"),
  "snare-trap": item("Snare Trap", "trap", "bury", 7, 720, 1, "#a88a5d", "snare-trap"),
  "shock-seed": item("Shock Seed", "throwable", "stun", 4, 100, 1, "#d5b06f", "shock-seed"),
  "smoke-bomb": item("Smoke Bomb", "throwable", "smoke", 0.72, 240, 1, "#9f91bf", "smoke-bomb"),
  "reflector-charm": item("Reflector Charm", "auto", "projectile-shield", 1, 480, 1, "#f3b44c", "reflector-charm"),
  "time-dilator": item("Time Dilator", "auto", "slow-time", 0.58, 300, 1, "#80b8ff", "time-dilator"),
};

export const ITEM_KINDS = Object.freeze(Object.keys(ITEM_DEFINITIONS) as ItemKind[]);

export const isAutomaticItem = (kind: ItemKind): boolean =>
  ITEM_DEFINITIONS[kind].category === "auto";
