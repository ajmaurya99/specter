import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * WCAG AA contrast, computed from the actual tokens in app/globals.css.
 * The spec authorizes adjusting verdict shades to meet AA — this test is
 * what locks the adjusted values in.
 */

const css = readFileSync(path.join(__dirname, "../../app/globals.css"), "utf8");

function token(name: string): string {
  const match = css.match(new RegExp(`--color-${name}:\\s*(#[0-9a-fA-F]{6})`));
  if (!match) throw new Error(`token --color-${name} not found in globals.css`);
  return match[1];
}

function luminance(hex: string): number {
  const channels = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function ratio(fg: string, bg: string): number {
  const [l1, l2] = [luminance(fg), luminance(bg)].sort((a, b) => b - a);
  return (l1 + 0.05) / (l2 + 0.05);
}

const AA_NORMAL = 4.5;
const AA_LARGE = 3;

describe("chrome text meets AA (4.5:1) on both surfaces", () => {
  const surfaces = { bg: token("bg"), surface: token("surface") } as const;

  for (const [surfaceName, surface] of Object.entries(surfaces)) {
    it(`ink on ${surfaceName}`, () => {
      expect(ratio(token("ink"), surface)).toBeGreaterThanOrEqual(AA_NORMAL);
    });
    it(`muted on ${surfaceName}`, () => {
      expect(ratio(token("muted"), surface)).toBeGreaterThanOrEqual(AA_NORMAL);
    });
  }

  it("surface text on ink (primary buttons)", () => {
    expect(ratio(token("surface"), token("ink"))).toBeGreaterThanOrEqual(AA_NORMAL);
  });
});

describe("verdict text shades meet AA on white, page bg, and their tints", () => {
  const cases = [
    ["visible-text", ["surface", "bg", "visible-tint"]],
    ["partial-text", ["surface", "bg", "partial-tint"]],
    ["invisible-text", ["surface", "bg", "invisible-tint"]],
  ] as const;

  for (const [text, backgrounds] of cases) {
    for (const bg of backgrounds) {
      it(`${text} on ${bg}`, () => {
        expect(ratio(token(text), token(bg))).toBeGreaterThanOrEqual(AA_NORMAL);
      });
    }
  }
});

describe("verdict fills meet AA for UI components (3:1) against surfaces", () => {
  for (const fill of ["visible", "partial", "invisible"] as const) {
    it(`${fill} dot/bar on white`, () => {
      expect(ratio(token(fill), token("surface"))).toBeGreaterThanOrEqual(AA_LARGE);
    });
    it(`${fill} dot/bar on page bg`, () => {
      expect(ratio(token(fill), token("bg"))).toBeGreaterThanOrEqual(AA_LARGE);
    });
  }
});

describe("ink on verdict tints (region names on the map)", () => {
  for (const tint of ["visible-tint", "partial-tint", "invisible-tint"] as const) {
    it(`ink on ${tint}`, () => {
      expect(ratio(token("ink"), token(tint))).toBeGreaterThanOrEqual(AA_NORMAL);
    });
  }
});
