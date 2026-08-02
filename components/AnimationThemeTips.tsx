import {
  ANIMATION_THEME_TOKENS,
  camelToKebab,
  type AnimationThemeToken,
} from "@/lib/useAnimationSrc";

/**
 * What each token is normally used for. Typed against the forwarded token list,
 * so adding a token in `ANIMATION_THEME_TOKENS` without describing it here is a
 * compile error.
 */
const TOKEN_USE: Record<AnimationThemeToken, string> = {
  background: "Page / canvas ground",
  foreground: "Primary text, lines",
  muted: "Subdued fill areas",
  mutedForeground: "Secondary labels",
  border: "Dividers, axis lines",
  accent: "Brand accent, emphasis",
  accentForeground: "Text on accent fill",
  link: "Link colour",
  linkHover: "Emphasised accent",
  codeBackground: "Code-block fill",
  surface: "Raised cards, panels",
  surfaceHover: "Hovered surface",
  primaryBtn: "Primary fill / CTA",
  primaryBtnText: "Text on primary fill",
  inputBorder: "Input borders",
  inputFocusBorder: "Focused input border",
  secondaryText: "Labels, captions",
};

/**
 * Collapsible reference for the colour tokens available inside an animation.
 * Swatches are painted from the live CSS custom properties, so they always show
 * the reader's current theme rather than hardcoded values.
 */
export default function AnimationThemeTips() {
  return (
    <details className="border rounded themed-surface">
      <summary className="cursor-pointer px-4 py-2 text-sm font-medium themed-secondary select-none">
        Theme colours you can use
      </summary>
      <div className="px-4 py-3 border-t themed-border space-y-3">
        <p className="text-xs themed-muted">
          Never hardcode hex values — read colours from{" "}
          <code className="themed-inline-code">window.theme</code> so the animation follows the
          reader&rsquo;s theme. The values are captured when the frame loads; if the reader switches
          light/dark the animation repaints on the next page load, not instantly.
        </p>

        <pre className="themed-pre text-xs overflow-x-auto">
          <code>{`ctx.fillStyle = window.theme.background;
ctx.fillRect(0, 0, canvas.width, canvas.height);
ctx.strokeStyle = window.theme.foreground;`}</code>
        </pre>

        <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1.5">
          {ANIMATION_THEME_TOKENS.map((token) => (
            <li key={token} className="flex items-center gap-2 min-w-0">
              <span
                aria-hidden="true"
                className="w-3.5 h-3.5 rounded-sm shrink-0 themed-border border"
                style={{ background: `var(--${camelToKebab(token)})` }}
              />
              <code className="text-xs font-mono themed-foreground shrink-0">{token}</code>
              <span className="text-xs themed-muted truncate">{TOKEN_USE[token]}</span>
            </li>
          ))}
        </ul>

        <p className="text-xs themed-muted">
          All values are hex strings. The page gives you one{" "}
          <code className="themed-inline-code">&lt;canvas id=&quot;canvas&quot;&gt;</code> — set its
          resolution with <code className="themed-inline-code">canvas.width</code> /{" "}
          <code className="themed-inline-code">canvas.height</code>. See{" "}
          <code className="themed-inline-code">docs/animations.md</code> for the full authoring
          guide.
        </p>
      </div>
    </details>
  );
}
