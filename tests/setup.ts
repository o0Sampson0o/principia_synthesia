// Set AUTH_SECRET before any module imports so lib/env.ts reads a valid secret.
process.env.AUTH_SECRET = "test-secret-test-secret-please-replace";

import "@testing-library/jest-dom";
import { vi } from "vitest";

// jsdom implements no media queries at all, so anything reading the colour
// scheme (theme-aware editors, the animation frame) explodes without this.
// Defaults to light and never fires; individual tests override it to simulate
// dark mode or to drive a `change` event.
// Guarded: this setup file also runs for `@vitest-environment node` specs,
// which have no `window` at all.
if (typeof window !== "undefined") {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    configurable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(() => false),
    }),
  });
}

// Mock next/navigation
vi.mock("next/navigation", () => ({
  useRouter: vi.fn(() => ({
    push: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
  })),
  usePathname: vi.fn(() => "/"),
  useSearchParams: vi.fn(() => new URLSearchParams()),
  redirect: vi.fn((url: string) => {
    throw Object.assign(new Error(`NEXT_REDIRECT: ${url}`), {
      digest: `NEXT_REDIRECT;${url}`,
    });
  }),
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));

// Mock next/cache
vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
}));

// Mock next/headers
vi.mock("next/headers", () => ({
  cookies: vi.fn().mockResolvedValue({
    get: vi.fn(),
    set: vi.fn(),
    delete: vi.fn(),
    has: vi.fn(),
  }),
  headers: vi.fn().mockResolvedValue(new Map()),
}));
