// @vitest-environment node
import { describe, it, expect } from "vitest";
import { validateAnimationScript } from "@/lib/validate-animation";

describe("validateAnimationScript", () => {
  it("accepts a simple named-function animation", () => {
    const code = `function MyAnim() {
  const canvas = document.getElementById('canvas');
  const ctx = canvas.getContext('2d');
  ctx.fillRect(0, 0, 100, 100);
}`;
    expect(validateAnimationScript(code)).toEqual({ ok: true });
  });

  it("accepts an IIFE animation", () => {
    const code = `(function() {
  const canvas = document.getElementById('canvas');
  requestAnimationFrame(function loop() { requestAnimationFrame(loop); });
})();`;
    expect(validateAnimationScript(code)).toEqual({ ok: true });
  });

  it("rejects eval()", () => {
    const result = validateAnimationScript("eval('alert(1)')");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/eval/);
  });

  it("rejects new Function()", () => {
    const result = validateAnimationScript("const f = new Function('return 1')");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/Function/);
  });

  it("rejects top-level ES imports", () => {
    const result = validateAnimationScript("import { something } from 'lib'");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/import/i);
  });

  it("rejects require()", () => {
    const result = validateAnimationScript("const x = require('lodash')");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/require/i);
  });

  it("allows the word 'evaluate' (not eval())", () => {
    const code = `function anim() { const x = evaluate(); }`;
    // 'evaluate' does not match /\beval\s*\(/
    expect(validateAnimationScript(code)).toEqual({ ok: true });
  });

  it("allows string literals containing 'eval'", () => {
    // The regex is not source-aware, but 'eval' inside a string with no paren is fine
    const code = `function anim() { const msg = 'no eval here'; }`;
    expect(validateAnimationScript(code)).toEqual({ ok: true });
  });
});
