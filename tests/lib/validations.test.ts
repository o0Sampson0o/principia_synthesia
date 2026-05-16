import { describe, it, expect } from "vitest";
import { createKaoSchema, updateKaoSchema, articleMetadataSchema } from "@/lib/validations";

describe("createKaoSchema", () => {
  it("parses valid animation input successfully", () => {
    const result = createKaoSchema.safeParse({
      slug: "anim-my-animation",
      name: "My Animation",
      type: "animation",
      content: '{"fps":60}',
      description: "A nice animation",
      ownerType: "user",
      ownerId: 1,
    });
    expect(result.success).toBe(true);
  });

  it("fails when name is missing", () => {
    const result = createKaoSchema.safeParse({
      slug: "anim-my-animation",
      // name omitted
      type: "animation",
      content: '{"fps":60}',
      ownerType: "user",
      ownerId: 1,
    });
    expect(result.success).toBe(false);
    expect(result.error!.flatten().fieldErrors).toHaveProperty("name");
  });

  it("fails when animation slug does not start with anim-", () => {
    const result = createKaoSchema.safeParse({
      slug: "my-animation",
      name: "My Animation",
      type: "animation",
      content: '{"fps":60}',
      ownerType: "user",
      ownerId: 1,
    });
    expect(result.success).toBe(false);
    expect(result.error!.flatten().fieldErrors).toHaveProperty("slug");
  });

  it("fails when type is not in the allowed enum", () => {
    const result = createKaoSchema.safeParse({
      slug: "object-my-video",
      name: "My Video",
      type: "video",
      content: '{}',
      ownerType: "user",
      ownerId: 1,
    });
    expect(result.success).toBe(false);
    expect(result.error!.flatten().fieldErrors).toHaveProperty("type");
  });

  it("parses valid dataset input successfully", () => {
    const result = createKaoSchema.safeParse({
      slug: "object-my-dataset",
      name: "My Dataset",
      type: "dataset",
      content: '{"rows":100}',
      ownerType: "org",
      ownerId: 5,
    });
    expect(result.success).toBe(true);
  });
});

describe("updateKaoSchema", () => {
  it("parses valid input with an id successfully", () => {
    const result = updateKaoSchema.safeParse({
      id: 42,
      slug: "anim-my-animation",
      name: "My Animation",
      type: "animation",
      content: '{"fps":30}',
      ownerType: "user",
      ownerId: 1,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.id).toBe(42);
    }
  });

  it("coerces id from string '5' to number 5", () => {
    const result = updateKaoSchema.safeParse({
      id: "5",
      slug: "object-my-diagram",
      name: "My Diagram",
      type: "diagram",
      content: '{"nodes":[]}',
      ownerType: "user",
      ownerId: 1,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.id).toBe(5);
    }
  });
});

describe("articleMetadataSchema", () => {
  it("applies all four defaults when input is {}", () => {
    const result = articleMetadataSchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.status).toBe("published");
      expect(result.data.tags).toEqual([]);
      expect(result.data.description).toBe("");
      expect(result.data.canvas).toBeNull();
    }
  });

  it("rejects an unknown status value", () => {
    const result = articleMetadataSchema.safeParse({ status: "secret" });
    expect(result.success).toBe(false);
    expect(result.error!.flatten().fieldErrors).toHaveProperty("status");
  });

  it("rejects tags arrays longer than 20 items", () => {
    const result = articleMetadataSchema.safeParse({
      tags: Array.from({ length: 21 }, (_, i) => `tag${i}`),
    });
    expect(result.success).toBe(false);
    expect(result.error!.flatten().fieldErrors).toHaveProperty("tags");
  });

  it("rejects individual tags longer than 50 chars", () => {
    const result = articleMetadataSchema.safeParse({
      tags: ["a".repeat(51)],
    });
    expect(result.success).toBe(false);
    expect(result.error!.flatten().fieldErrors).toHaveProperty("tags");
  });

  it("trims and lowercases each tag", () => {
    const result = articleMetadataSchema.safeParse({
      tags: ["  Physics  ", "MECHANICS"],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.tags).toEqual(["physics", "mechanics"]);
    }
  });

  it("rejects description longer than 300 chars", () => {
    const result = articleMetadataSchema.safeParse({
      description: "x".repeat(301),
    });
    expect(result.success).toBe(false);
    expect(result.error!.flatten().fieldErrors).toHaveProperty("description");
  });

  it("accepts null canvas", () => {
    const result = articleMetadataSchema.safeParse({ canvas: null });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.canvas).toBeNull();
    }
  });

  it("accepts a valid anim- prefixed canvas slug", () => {
    const result = articleMetadataSchema.safeParse({ canvas: "anim-double-pendulum" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.canvas).toBe("anim-double-pendulum");
    }
  });

  it("rejects canvas without the anim- prefix", () => {
    const result = articleMetadataSchema.safeParse({ canvas: "double-pendulum" });
    expect(result.success).toBe(false);
    expect(result.error!.flatten().fieldErrors).toHaveProperty("canvas");
  });

  it("rejects canvas with spaces", () => {
    const result = articleMetadataSchema.safeParse({ canvas: "With Spaces" });
    expect(result.success).toBe(false);
    expect(result.error!.flatten().fieldErrors).toHaveProperty("canvas");
  });

  it("rejects canvas with uppercase letters", () => {
    const result = articleMetadataSchema.safeParse({ canvas: "UPPER" });
    expect(result.success).toBe(false);
    expect(result.error!.flatten().fieldErrors).toHaveProperty("canvas");
  });

  it("rejects empty string canvas (use null instead)", () => {
    const result = articleMetadataSchema.safeParse({ canvas: "" });
    expect(result.success).toBe(false);
    expect(result.error!.flatten().fieldErrors).toHaveProperty("canvas");
  });
});
