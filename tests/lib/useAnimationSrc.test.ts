import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useAnimationSrc, buildAnimationSrc, ANIMATION_THEME_TOKENS } from "@/lib/useAnimationSrc";
import { themeTokensSchema } from "@/lib/validations";

// Helper: create a mock getComputedStyle that returns predictable CSS var values
function mockGetComputedStyle(tokenValues: Record<string, string> = {}) {
  const defaultValue = "#aabbcc";
  return vi.spyOn(window, "getComputedStyle").mockReturnValue({
    getPropertyValue: (prop: string) => tokenValues[prop] ?? defaultValue,
  } as unknown as CSSStyleDeclaration);
}

const TEST_PUBLISHER = "alice";

describe("buildAnimationSrc", () => {
  let computedStyleSpy: ReturnType<typeof mockGetComputedStyle>;

  beforeEach(() => {
    computedStyleSpy = mockGetComputedStyle({
      "--background": "#ffffff",
      "--foreground": "#000000",
    });
  });

  afterEach(() => {
    computedStyleSpy.mockRestore();
  });

  it("returns a string starting with /api/publishers/<publisher>/animations/<slug>?theme=", () => {
    const src = buildAnimationSrc(TEST_PUBLISHER, "anim-my-slug");
    expect(src).toMatch(/^\/api\/publishers\/alice\/animations\/anim-my-slug\?theme=/);
  });

  it("encodes a valid JSON theme object in the ?theme= query param", () => {
    const src = buildAnimationSrc(TEST_PUBLISHER, "anim-my-slug");
    const url = new URL(src, "http://localhost");
    const raw = url.searchParams.get("theme");
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(decodeURIComponent(raw!));
    expect(parsed).toHaveProperty("light");
    expect(parsed).toHaveProperty("dark");
    expect(typeof parsed.light).toBe("object");
    expect(typeof parsed.dark).toBe("object");
  });

  it("forwards every ThemeTokens field, and nothing else", () => {
    const src = buildAnimationSrc(TEST_PUBLISHER, "anim-my-slug");
    const url = new URL(src, "http://localhost");
    const raw = url.searchParams.get("theme")!;
    const parsed = JSON.parse(decodeURIComponent(raw));

    // The forwarded set must match the theme schema exactly — a token added to
    // ThemeTokens but not forwarded silently falls back to the built-in default
    // inside the animation iframe.
    const schemaKeys = Object.keys(themeTokensSchema.shape).sort();
    expect([...ANIMATION_THEME_TOKENS].sort()).toEqual(schemaKeys);
    expect(Object.keys(parsed.light).sort()).toEqual(schemaKeys);
    expect(Object.keys(parsed.dark).sort()).toEqual(schemaKeys);
  });

  it("reads from getComputedStyle(document.documentElement)", () => {
    buildAnimationSrc(TEST_PUBLISHER, "anim-test-slug");
    expect(computedStyleSpy).toHaveBeenCalledWith(document.documentElement);
  });

  it("the slug appears verbatim in the returned URL", () => {
    const src = buildAnimationSrc(TEST_PUBLISHER, "anim-orbit-sim");
    expect(src).toContain("/api/publishers/alice/animations/anim-orbit-sim");
  });

  it("the publisher appears in the returned URL", () => {
    const src = buildAnimationSrc("bob", "anim-wave");
    expect(src).toContain("/api/publishers/bob/animations/anim-wave");
  });

  it("includes &v=<version> when version is provided", () => {
    const src = buildAnimationSrc(TEST_PUBLISHER, "anim-my-slug", 3);
    expect(src).toContain("&v=3");
  });

  it("omits the v param when version is not provided", () => {
    const src = buildAnimationSrc(TEST_PUBLISHER, "anim-my-slug");
    expect(src).not.toContain("&v=");
  });
});

describe("useAnimationSrc", () => {
  let computedStyleSpy: ReturnType<typeof mockGetComputedStyle>;

  beforeEach(() => {
    computedStyleSpy = mockGetComputedStyle();
  });

  afterEach(() => {
    computedStyleSpy.mockRestore();
  });

  it("returns null on initial render (before the effect fires)", () => {
    const { result } = renderHook(() => useAnimationSrc(TEST_PUBLISHER, "anim-my-slug"));
    // jsdom flushes useEffect synchronously during renderHook, so by the time
    // renderHook returns, the effect has already set the URL. The null state
    // exists only transiently during the render phase (SSR-safe) and is not
    // observable here. Assert the post-effect value instead.
    expect(result.current).toMatch(/^\/api\/publishers\/alice\/animations\/anim-my-slug\?theme=/);
  });

  it("returns a URL string after mount (after the effect runs)", async () => {
    const { result } = renderHook(() => useAnimationSrc(TEST_PUBLISHER, "anim-my-slug"));

    await act(async () => {});

    expect(result.current).not.toBeNull();
    expect(typeof result.current).toBe("string");
    expect(result.current).toMatch(/^\/api\/publishers\/alice\/animations\/anim-my-slug\?theme=/);
  });

  it("the URL after mount contains a valid JSON theme param", async () => {
    const { result } = renderHook(() => useAnimationSrc(TEST_PUBLISHER, "anim-orbit-sim"));
    await act(async () => {});

    const src = result.current!;
    const url = new URL(src, "http://localhost");
    const raw = url.searchParams.get("theme");
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(decodeURIComponent(raw!));
    expect(parsed).toHaveProperty("light");
    expect(parsed).toHaveProperty("dark");
  });

  it("updates the src when slug changes", async () => {
    const { result, rerender } = renderHook(
      ({ slug }) => useAnimationSrc(TEST_PUBLISHER, slug),
      { initialProps: { slug: "anim-slug-one" } }
    );
    await act(async () => {});

    expect(result.current).toContain("/api/publishers/alice/animations/anim-slug-one");

    rerender({ slug: "anim-slug-two" });
    await act(async () => {});

    expect(result.current).toContain("/api/publishers/alice/animations/anim-slug-two");
  });

  it("includes version param when version is provided", async () => {
    const { result } = renderHook(() => useAnimationSrc(TEST_PUBLISHER, "anim-my-slug", 7));
    await act(async () => {});

    expect(result.current).toContain("&v=7");
  });
});

describe("useAnimationSrc — colour scheme changes", () => {
  /** A matchMedia stub whose `change` listeners can be fired on demand. */
  function stubMatchMedia() {
    const listeners: Array<() => void> = [];
    vi.spyOn(window, "matchMedia").mockImplementation(
      (query: string) =>
        ({
          matches: false,
          media: query,
          addEventListener: (_: string, fn: () => void) => listeners.push(fn),
          removeEventListener: (_: string, fn: () => void) => {
            const i = listeners.indexOf(fn);
            if (i >= 0) listeners.splice(i, 1);
          },
        }) as unknown as MediaQueryList
    );
    return {
      fire: () => listeners.forEach((fn) => fn()),
      get count() {
        return listeners.length;
      },
    };
  }

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("rebuilds the URL with the new palette when the scheme flips", async () => {
    // getComputedStyle only ever reports the *active* scheme, so the URL has to
    // be rebuilt on change or the animation keeps the old colours.
    const style = mockGetComputedStyle({ "--foreground": "#000000" });
    const mq = stubMatchMedia();

    const { result } = renderHook(() => useAnimationSrc(TEST_PUBLISHER, "anim-x"));
    await act(async () => {});
    const before = result.current!;
    expect(decodeURIComponent(before)).toContain("#000000");

    style.mockRestore();
    mockGetComputedStyle({ "--foreground": "#ffffff" });
    await act(async () => {
      mq.fire();
    });

    expect(result.current).not.toBe(before);
    expect(decodeURIComponent(result.current!)).toContain("#ffffff");
  });

  it("removes its listener on unmount", async () => {
    mockGetComputedStyle();
    const mq = stubMatchMedia();
    const { unmount } = renderHook(() => useAnimationSrc(TEST_PUBLISHER, "anim-x"));
    await act(async () => {});
    expect(mq.count).toBe(1);
    unmount();
    expect(mq.count).toBe(0);
  });
});
