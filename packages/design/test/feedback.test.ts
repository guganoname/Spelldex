import { describe, expect, it } from "vitest";
import { feedback, unlockFeedback, FEEDBACK_EVENTS, EVENTS, setFeedbackPrefs, getFeedbackPrefs } from "../src/feedback/index";
import { RECIPES } from "../src/feedback/recipes";
import { mulberry32 } from "../src/feedback/dsp";
import { springToCss, sampleSpring } from "../src/motion/spring";
import { motion, color } from "../src/tokens/tokens";

describe("feedback ohne Browser", () => {
  it("ist ein No-op und wirft nicht", async () => {
    for (const ev of FEEDBACK_EVENTS) expect(() => feedback(ev, { gem: "U", rarity: "mythic" })).not.toThrow();
    await expect(unlockFeedback()).resolves.toBeUndefined();
  });
});

describe("iPhone-Muster", () => {
  it("beginnen bei 0, steigen an und bleiben unter einer Sekunde", () => {
    for (const ev of FEEDBACK_EVENTS) {
      const spec = EVENTS[ev].iosPattern;
      if (!spec) continue;
      for (const rarity of ["common", "uncommon", "rare", "mythic"] as const) {
        const p = typeof spec === "function" ? spec({ rarity }) : spec;
        expect(p[0], ev).toBe(0);
        for (let i = 1; i < p.length; i++) expect(p[i]!, ev).toBeGreaterThan(p[i - 1]!);
        expect(p.at(-1)!, ev).toBeLessThan(1000);
      }
    }
  });
  it("Prefs-Umschaltung ist ohne Browser ein No-op", () => {
    expect(() => setFeedbackPrefs({ iosHaptics: "tap" })).not.toThrow();
    expect(getFeedbackPrefs().iosHaptics).toBe("tap");
    setFeedbackPrefs({ iosHaptics: "hybrid" });
  });
});

describe("Klangrezepte", () => {
  it("jedes Ereignis verweist auf ein existierendes Rezept", () => {
    for (const ev of FEEDBACK_EVENTS) {
      for (const o of [{}, { gem: "R" as const }, { rarity: "rare" as const }]) {
        const id = EVENTS[ev].sound(o);
        if (id) expect(RECIPES[id], `${ev} -> ${id}`).toBeTypeOf("function");
      }
    }
  });
  it("liefert endliche, nicht übersteuerte Samples", () => {
    for (const [id, recipe] of Object.entries(RECIPES)) {
      const d = recipe(mulberry32(1));
      expect(d.length, id).toBeGreaterThan(1000);
      let peak = 0;
      let finite = true;
      for (const x of d) {
        if (!Number.isFinite(x)) finite = false;
        peak = Math.max(peak, Math.abs(x));
      }
      expect(finite, id).toBe(true);
      expect(peak, id).toBeLessThanOrEqual(0.75);
      expect(peak, id).toBeGreaterThan(0.05);
    }
  }, 30_000);
  it("ist deterministisch pro Seed", () => {
    const a = RECIPES.press!(mulberry32(5));
    const b = RECIPES.press!(mulberry32(5));
    expect(Array.from(a.slice(0, 200))).toEqual(Array.from(b.slice(0, 200)));
  });
});

describe("Federn und Tokens", () => {
  it("Federn kommen zur Ruhe und schwingen höchstens leicht über", () => {
    for (const [name, s] of Object.entries(motion.spring)) {
      const pts = sampleSpring(s);
      expect(pts.at(-1), name).toBe(1);
      expect(Math.max(...pts), name).toBeLessThan(1.15);
      expect(springToCss(s).easing.startsWith("linear(0")).toBe(true);
    }
  });
  it("Manafarben sind gültige Hex-Werte", () => {
    for (const v of Object.values(color.mana)) expect(v).toMatch(/^#[0-9a-f]{6}$/);
  });
});
