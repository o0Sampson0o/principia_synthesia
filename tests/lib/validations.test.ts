import { describe, it, expect } from "vitest";
import { createKaoSchema, updateKaoSchema, pluginManifestSchema } from "@/lib/validations";

describe("createKaoSchema", () => {
  it("parses valid animation input successfully", () => {
    const result = createKaoSchema.safeParse({
      slug: "my-animation",
      name: "My Animation",
      type: "animation",
      content: '{"fps":60}',
      description: "A nice animation",
    });
    expect(result.success).toBe(true);
  });

  it("fails when name is missing", () => {
    const result = createKaoSchema.safeParse({
      slug: "my-animation",
      // name omitted
      type: "animation",
      content: '{"fps":60}',
    });
    expect(result.success).toBe(false);
    expect(result.error!.flatten().fieldErrors).toHaveProperty("name");
  });

  it("fails when slug contains uppercase characters", () => {
    const result = createKaoSchema.safeParse({
      slug: "MyAnimation",
      name: "My Animation",
      type: "animation",
      content: '{"fps":60}',
    });
    expect(result.success).toBe(false);
    expect(result.error!.flatten().fieldErrors).toHaveProperty("slug");
  });

  it("fails when type is not in the allowed enum", () => {
    const result = createKaoSchema.safeParse({
      slug: "my-video",
      name: "My Video",
      type: "video",
      content: '{}',
    });
    expect(result.success).toBe(false);
    expect(result.error!.flatten().fieldErrors).toHaveProperty("type");
  });
});

describe("updateKaoSchema", () => {
  it("parses valid input with an id successfully", () => {
    const result = updateKaoSchema.safeParse({
      id: 42,
      slug: "my-animation",
      name: "My Animation",
      type: "dataset",
      content: '{"rows":100}',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.id).toBe(42);
    }
  });

  it("coerces id from string '5' to number 5", () => {
    const result = updateKaoSchema.safeParse({
      id: "5",
      slug: "my-diagram",
      name: "My Diagram",
      type: "diagram",
      content: '{"nodes":[]}',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.id).toBe(5);
    }
  });
});

describe("pluginManifestSchema", () => {
  const validManifest = {
    slug: "double-pendulum",
    name: "Double Pendulum",
    version: "1.0.0",
    description: "A chaotic pendulum simulation.",
    author: "Principia Synthesia",
    tags: ["physics", "chaos"],
    license: "MIT",
    entrypoint: "animation.js",
  };

  it("parses a valid manifest successfully", () => {
    const result = pluginManifestSchema.safeParse(validManifest);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.slug).toBe("double-pendulum");
      expect(result.data.entrypoint).toBe("animation.js");
    }
  });

  it("accepts minimal manifest with only required fields", () => {
    const result = pluginManifestSchema.safeParse({
      slug: "simple-anim",
      name: "Simple Animation",
      version: "0.1.0",
      entrypoint: "index.js",
    });
    expect(result.success).toBe(true);
  });

  it("fails when slug is missing", () => {
    const result = pluginManifestSchema.safeParse({ ...validManifest, slug: undefined });
    expect(result.success).toBe(false);
    expect(result.error!.flatten().fieldErrors).toHaveProperty("slug");
  });

  it("fails when name is missing", () => {
    const result = pluginManifestSchema.safeParse({ ...validManifest, name: undefined });
    expect(result.success).toBe(false);
    expect(result.error!.flatten().fieldErrors).toHaveProperty("name");
  });

  it("fails when version is missing", () => {
    const result = pluginManifestSchema.safeParse({ ...validManifest, version: undefined });
    expect(result.success).toBe(false);
    expect(result.error!.flatten().fieldErrors).toHaveProperty("version");
  });

  it("fails when entrypoint is missing", () => {
    const result = pluginManifestSchema.safeParse({ ...validManifest, entrypoint: undefined });
    expect(result.success).toBe(false);
    expect(result.error!.flatten().fieldErrors).toHaveProperty("entrypoint");
  });

  it("fails when slug contains uppercase characters", () => {
    const result = pluginManifestSchema.safeParse({ ...validManifest, slug: "DoublePendulum" });
    expect(result.success).toBe(false);
    expect(result.error!.flatten().fieldErrors).toHaveProperty("slug");
  });

  it("fails when slug contains spaces", () => {
    const result = pluginManifestSchema.safeParse({ ...validManifest, slug: "double pendulum" });
    expect(result.success).toBe(false);
    expect(result.error!.flatten().fieldErrors).toHaveProperty("slug");
  });

  it("fails when entrypoint has no .js extension", () => {
    const result = pluginManifestSchema.safeParse({ ...validManifest, entrypoint: "animation.ts" });
    expect(result.success).toBe(false);
    expect(result.error!.flatten().fieldErrors).toHaveProperty("entrypoint");
  });

  it("fails when entrypoint is a path with directory separators", () => {
    const result = pluginManifestSchema.safeParse({ ...validManifest, entrypoint: "src/animation.js" });
    expect(result.success).toBe(false);
    expect(result.error!.flatten().fieldErrors).toHaveProperty("entrypoint");
  });

  it("fails when tags array exceeds 10 items", () => {
    const result = pluginManifestSchema.safeParse({
      ...validManifest,
      tags: ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j", "k"],
    });
    expect(result.success).toBe(false);
    expect(result.error!.flatten().fieldErrors).toHaveProperty("tags");
  });
});
