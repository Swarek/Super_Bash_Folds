import type { ActionName, FighterId, InputFrame, PlayerSlot } from "./contracts";
import type { FighterSnapshot, GameSnapshot } from "./engine";
import { getFighterDefinition } from "./roster";

export interface AIDifficulty {
  reactionFrames: [number, number];
  mistakeChance: number;
  defendChance: number;
  grabChance: number;
  specialChance: number;
  edgeGuardChance: number;
}

export const AI_DIFFICULTIES: Readonly<Record<1 | 2 | 3, AIDifficulty>> = {
  1: {
    reactionFrames: [18, 30],
    mistakeChance: 0.3,
    defendChance: 0.08,
    grabChance: 0.08,
    specialChance: 0.18,
    edgeGuardChance: 0.05,
  },
  2: {
    reactionFrames: [8, 14],
    mistakeChance: 0.13,
    defendChance: 0.32,
    grabChance: 0.18,
    specialChance: 0.28,
    edgeGuardChance: 0.3,
  },
  3: {
    reactionFrames: [3, 6],
    mistakeChance: 0.035,
    defendChance: 0.58,
    grabChance: 0.25,
    specialChance: 0.36,
    edgeGuardChance: 0.62,
  },
};

interface Intent {
  direction: { x: number; y: number };
  action: Exclude<ActionName, "pause"> | null;
  flickDirection: boolean;
  shieldFrames: number;
}

class AIRandom {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0 || 0x6d2b79f5;
  }

  next(): number {
    this.state = Math.imul(this.state ^ (this.state >>> 15), 1 | this.state);
    this.state ^= this.state + Math.imul(this.state ^ (this.state >>> 7), 61 | this.state);
    return ((this.state ^ (this.state >>> 14)) >>> 0) / 4_294_967_296;
  }
}

const clampAxis = (value: number): number => Math.max(-1, Math.min(1, value));

const directionActions = (direction: { x: number; y: number }): Set<ActionName> => {
  const held = new Set<ActionName>();
  if (direction.x < -0.2) held.add("left");
  if (direction.x > 0.2) held.add("right");
  if (direction.y < -0.35) held.add("down");
  if (direction.y > 0.35) held.add("up");
  return held;
};

const actionForDirection = (
  direction: { x: number; y: number },
): "left" | "right" | "up" | "down" | null => {
  if (Math.abs(direction.y) > Math.abs(direction.x) && Math.abs(direction.y) > 0.35) {
    return direction.y > 0 ? "up" : "down";
  }
  if (Math.abs(direction.x) > 0.2) return direction.x > 0 ? "right" : "left";
  return null;
};

export const projectileSpecialDirectionForFighter = (
  fighter: FighterId,
  toward: number,
): { x: number; y: number } | null => {
  const attacks = getFighterDefinition(fighter).attacks;
  if (attacks["neutral-special"].projectile) return { x: 0, y: 0 };
  if (attacks["side-special"].projectile) return { x: Math.sign(toward) || 1, y: 0 };
  if (attacks["up-special"].projectile) return { x: 0, y: 1 };
  if (attacks["down-special"].projectile) return { x: 0, y: -1 };
  return null;
};

export class CpuController {
  readonly slot: PlayerSlot;
  readonly level: 1 | 2 | 3;

  private random: AIRandom;
  private previousHeld = new Set<ActionName>();
  private nextDecisionFrame = 0;
  private shieldUntilFrame = 0;
  private intent: Intent = {
    direction: { x: 0, y: 0 },
    action: null,
    flickDirection: false,
    shieldFrames: 0,
  };

  constructor(slot: PlayerSlot, level: 1 | 2 | 3, seed = 0xa11ce) {
    this.slot = slot;
    this.level = level;
    this.random = new AIRandom(seed + slot * 97 + level * 7_919);
  }

  next(snapshot: GameSnapshot): InputFrame {
    if (snapshot.phase !== "playing") return this.buildFrame({ x: 0, y: 0 }, null, false);
    const self = snapshot.fighters[this.slot];
    const opponent = snapshot.fighters[this.slot === 0 ? 1 : 0];
    if (self.state === "ko" || self.state === "victory") {
      return this.buildFrame({ x: 0, y: 0 }, null, false);
    }

    if (this.needsRecovery(self)) {
      const recovery = this.recoveryIntent(self, snapshot.frame);
      return this.buildFrame(recovery.direction, recovery.action, recovery.flickDirection);
    }

    if (self.state === "hitstun") {
      const di = {
        x: self.position.x > 0 ? -0.85 : 0.85,
        y: self.velocity.y < 0 ? 0.65 : -0.15,
      };
      return this.buildFrame(di, null, false);
    }

    let action: Intent["action"] = null;
    let flickDirection = false;
    if (snapshot.frame >= this.nextDecisionFrame) {
      this.intent = this.chooseIntent(self, opponent);
      const [minimum, maximum] = AI_DIFFICULTIES[this.level].reactionFrames;
      this.nextDecisionFrame =
        snapshot.frame + minimum + Math.floor(this.random.next() * (maximum - minimum + 1));
      if (this.intent.shieldFrames > 0) {
        this.shieldUntilFrame = snapshot.frame + this.intent.shieldFrames;
      }
      action = this.intent.action;
      flickDirection = this.intent.flickDirection;
    }

    if (snapshot.frame < this.shieldUntilFrame) action = "shield";
    return this.buildFrame(this.intent.direction, action, flickDirection);
  }

  reset(seed = 0xa11ce): void {
    this.random = new AIRandom(seed + this.slot * 97 + this.level * 7_919);
    this.previousHeld.clear();
    this.nextDecisionFrame = 0;
    this.shieldUntilFrame = 0;
    this.intent = {
      direction: { x: 0, y: 0 },
      action: null,
      flickDirection: false,
      shieldFrames: 0,
    };
  }

  private chooseIntent(
    self: FighterSnapshot,
    opponent: FighterSnapshot,
  ): Intent {
    const difficulty = AI_DIFFICULTIES[this.level];
    const dx = opponent.position.x - self.position.x;
    const dy = opponent.position.y - self.position.y;
    const horizontalDistance = Math.abs(dx);
    const distance = Math.hypot(dx, dy);
    const toward = dx === 0 ? self.facing : Math.sign(dx);
    const opponentThreatening =
      opponent.currentMove !== null &&
      distance < (this.level === 3 ? 185 : 140) &&
      opponent.hitstunFrames === 0;

    if (this.random.next() < difficulty.mistakeChance) {
      return {
        direction: { x: this.random.next() < 0.5 ? -toward : 0, y: 0 },
        action: this.random.next() < 0.35 ? "jump" : null,
        flickDirection: false,
        shieldFrames: 0,
      };
    }

    if (opponentThreatening && this.random.next() < difficulty.defendChance) {
      const dodge = this.level === 3 && this.random.next() < 0.44;
      return {
        direction: dodge ? { x: -toward, y: self.grounded ? 0 : 0.35 } : { x: 0, y: 0 },
        action: "shield",
        flickDirection: dodge,
        shieldFrames: dodge ? 1 : 9 + this.level * 3,
      };
    }

    const opponentOffstage = Math.abs(opponent.position.x) > 500 || opponent.position.y < -25;
    if (
      opponentOffstage &&
      self.grounded &&
      this.random.next() < difficulty.edgeGuardChance
    ) {
      const edgeX = opponent.position.x < 0 ? -465 : 465;
      const edgeDelta = edgeX - self.position.x;
      if (Math.abs(edgeDelta) > 65) {
        return {
          direction: { x: Math.sign(edgeDelta), y: 0 },
          action: null,
          flickDirection: false,
          shieldFrames: 0,
        };
      }
      return {
        direction: { x: toward, y: -0.75 },
        action: this.random.next() < 0.5 ? "attack" : "special",
        flickDirection: true,
        shieldFrames: 0,
      };
    }

    if (distance < 82) {
      if (this.random.next() < difficulty.grabChance && opponent.invulnerableFrames === 0) {
        return {
          direction: { x: toward, y: 0 },
          action: "grab",
          flickDirection: false,
          shieldFrames: 0,
        };
      }
      const vertical = dy > 42 ? 0.8 : dy < -38 ? -0.8 : 0;
      const useSmash = this.level >= 2 && opponent.percent > 82 && this.random.next() < 0.5;
      return {
        direction: { x: vertical === 0 ? toward : 0, y: vertical },
        action: "attack",
        flickDirection: useSmash,
        shieldFrames: 0,
      };
    }

    if (distance < 190) {
      if (!self.grounded && Math.abs(dy) < 115) {
        return {
          direction: { x: toward, y: dy > 45 ? 0.75 : dy < -50 ? -0.75 : 0 },
          action: "attack",
          flickDirection: false,
          shieldFrames: 0,
        };
      }
      if (this.random.next() < difficulty.specialChance) {
        return {
          direction: { x: toward, y: dy > 80 ? 0.7 : 0 },
          action: "special",
          flickDirection: false,
          shieldFrames: 0,
        };
      }
      return {
        direction: { x: toward, y: 0 },
        action: "attack",
        flickDirection: this.level === 3 && opponent.percent > 100,
        shieldFrames: 0,
      };
    }

    const rangedSpecialDirection = projectileSpecialDirectionForFighter(self.fighter, toward);
    if (
      rangedSpecialDirection &&
      horizontalDistance < 620 &&
      this.random.next() < difficulty.specialChance
    ) {
      return {
        direction: rangedSpecialDirection,
        action: "special",
        flickDirection: false,
        shieldFrames: 0,
      };
    }

    const platformDelta = dy > 105 ? 0.72 : 0;
    return {
      direction: { x: toward, y: platformDelta },
      action: platformDelta > 0 && self.grounded && this.random.next() < 0.42 ? "jump" : null,
      flickDirection: false,
      shieldFrames: 0,
    };
  }

  private needsRecovery(self: FighterSnapshot): boolean {
    return Math.abs(self.position.x) > 505 || self.position.y < -80;
  }

  private recoveryIntent(self: FighterSnapshot, frame: number): Intent {
    const centerDirection = self.position.x > 0 ? -1 : 1;
    const upSpecial = getFighterDefinition(self.fighter).attacks["up-special"];
    const upSpecialMovement = upSpecial.movement;
    const authoredMovement = upSpecial.specialMovement;
    const hasPropulsiveUpSpecial = Boolean(
      (upSpecialMovement && upSpecialMovement.y > 0) ||
      (authoredMovement &&
        authoredMovement.kind !== "air-dive" &&
        authoredMovement.kind !== "ground-steered"),
    );
    const shouldUseSpecial =
      self.position.y < -185 ||
      (Math.abs(self.position.x) > 650 && self.jumpsRemaining === 0);
    if (hasPropulsiveUpSpecial && shouldUseSpecial && frame >= this.nextDecisionFrame) {
      this.nextDecisionFrame = frame + (this.level === 1 ? 25 : 12);
      return {
        direction: { x: centerDirection * 0.65, y: 1 },
        action: "special",
        flickDirection: true,
        shieldFrames: 0,
      };
    }
    if (self.jumpsRemaining > 0 && self.velocity.y < 65 && frame >= this.nextDecisionFrame) {
      this.nextDecisionFrame = frame + (this.level === 1 ? 18 : 9);
      return {
        direction: { x: centerDirection, y: 0.7 },
        action: "jump",
        flickDirection: false,
        shieldFrames: 0,
      };
    }
    return {
      direction: { x: centerDirection, y: self.velocity.y < -100 ? 0.55 : 0 },
      action: null,
      flickDirection: false,
      shieldFrames: 0,
    };
  }

  private buildFrame(
    rawDirection: { x: number; y: number },
    action: Intent["action"],
    flickDirection: boolean,
  ): InputFrame {
    const direction = { x: clampAxis(rawDirection.x), y: clampAxis(rawDirection.y) };
    const held = directionActions(direction);
    if (action) held.add(action);
    const pressed = new Set<ActionName>();
    const released = new Set<ActionName>();
    for (const heldAction of held) {
      if (!this.previousHeld.has(heldAction)) pressed.add(heldAction);
    }
    for (const previousAction of this.previousHeld) {
      if (!held.has(previousAction)) released.add(previousAction);
    }
    if (action) pressed.add(action);
    if (flickDirection) {
      const directionAction = actionForDirection(direction);
      if (directionAction) pressed.add(directionAction);
    }
    this.previousHeld = new Set(held);
    return { held, pressed, released, direction };
  }
}

export function createCpuController(
  slot: PlayerSlot,
  level: 1 | 2 | 3,
  seed?: number,
): CpuController {
  return new CpuController(slot, level, seed);
}

/** One-shot helper. Keep a CpuController instance for reaction timing and clean key edges. */
export function aiInput(
  snapshot: GameSnapshot,
  slot: PlayerSlot,
  level: 1 | 2 | 3,
  seed = snapshot.frame + 1,
): InputFrame {
  return new CpuController(slot, level, seed).next(snapshot);
}
