import { describe, it, expect } from "vitest";
import {
  DEFAULT_ANIMATION_HEIGHT,
  MIN_ANIMATION_HEIGHT,
  MAX_ANIMATION_HEIGHT,
  normalizeAnimationHeight,
  readAnimationHeight,
} from "@/lib/animation-dimensions";

describe("normalizeAnimationHeight", () => {
  it("passes through an in-range integer", () => {
    expect(normalizeAnimationHeight(520)).toBe(520);
  });

  it("accepts numeric strings (form inputs submit strings)", () => {
    expect(normalizeAnimationHeight("640")).toBe(640);
  });

  it("rounds fractional values", () => {
    expect(normalizeAnimationHeight(300.6)).toBe(301);
  });

  it("clamps below the minimum", () => {
    expect(normalizeAnimationHeight(10)).toBe(MIN_ANIMATION_HEIGHT);
    expect(normalizeAnimationHeight(-9000)).toBe(MIN_ANIMATION_HEIGHT);
  });

  it("clamps above the maximum", () => {
    expect(normalizeAnimationHeight(999999)).toBe(MAX_ANIMATION_HEIGHT);
  });

  it("falls back to the default for junk rather than throwing", () => {
    for (const junk of [undefined, null, "", "tall", NaN, Infinity, {}, [], true]) {
      expect(normalizeAnimationHeight(junk)).toBe(DEFAULT_ANIMATION_HEIGHT);
    }
  });

  it("never returns a value usable for CSS injection", () => {
    // The result is interpolated into a style attribute and a canvas attribute.
    expect(normalizeAnimationHeight("400px; background: url(evil)")).toBe(
      DEFAULT_ANIMATION_HEIGHT
    );
    expect(Number.isInteger(normalizeAnimationHeight("400"))).toBe(true);
  });
});

describe("readAnimationHeight", () => {
  it("reads a stored height", () => {
    expect(readAnimationHeight({ code: "x", height: 250 })).toBe(250);
  });

  it("defaults for animations saved before heights existed", () => {
    expect(readAnimationHeight({ code: "x" })).toBe(DEFAULT_ANIMATION_HEIGHT);
  });

  it("defaults for a non-object content column", () => {
    expect(readAnimationHeight(null)).toBe(DEFAULT_ANIMATION_HEIGHT);
    expect(readAnimationHeight("nope")).toBe(DEFAULT_ANIMATION_HEIGHT);
  });

  it("clamps a stored value that is out of range", () => {
    expect(readAnimationHeight({ height: 100000 })).toBe(MAX_ANIMATION_HEIGHT);
  });
});
