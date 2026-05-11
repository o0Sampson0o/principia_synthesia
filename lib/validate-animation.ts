export type ValidationResult = { ok: true } | { ok: false; reason: string };

/**
 * Basic static checks on animation script code.
 * Rejects patterns that could bypass the sandbox or cause security issues.
 * Does not substitute for iframe sandboxing — it's a first-pass lint.
 */
export function validateAnimationScript(code: string): ValidationResult {
  if (/\beval\s*\(/.test(code))
    return { ok: false, reason: "eval is not allowed" };
  if (/\bnew\s+Function\s*\(/.test(code))
    return { ok: false, reason: "Function constructor is not allowed" };
  if (/^\s*import\s+/m.test(code))
    return { ok: false, reason: "ES imports are not allowed — use the // @use directive instead" };
  if (/\brequire\s*\(/.test(code))
    return { ok: false, reason: "CommonJS require is not allowed" };
  return { ok: true };
}
