import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useAnimationSrc, buildAnimationSrc } from "@/lib/useAnimationSrc";

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

  it("theme JSON has the 15 expected token keys", () => {
    const src = buildAnimationSrc(TEST_PUBLISHER, "anim-my-slug");
    const url = new URL(src, "http://localhost");
    const raw = url.searchParams.get("theme")!;
    const parsed = JSON.parse(decodeURIComponent(raw));
    const expectedKeys = [
      "background", "foreground", "muted", "mutedForeground", "border",
      "link", "linkHover", "codeBackground", "surface", "surfaceHover",
      "primaryBtn", "primaryBtnText", "inputBorder", "inputFocusBorder",
      "secondaryText",
    ];
    for (const key of expectedKeys) {
      expect(parsed.light).toHaveProperty(key);
      expect(parsed.dark).toHaveProperty(key);
    }
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
    // The hook's documented SSR behavior is: null before hydration.
    // In jsdom (client), effects run synchronously, so after mount it's a URL.
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
