import { describe, it, expect } from "vitest";
import { createKaoSchema, updateKaoSchema } from "@/lib/validations";

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
