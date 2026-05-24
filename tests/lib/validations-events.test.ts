import { describe, it, expect } from "vitest";
import {
  eventSlugSchema,
  createEventSchema,
  updateEventSchema,
  deleteEventSchema,
  setVisibilitySchema,
  addAccessGrantSchema,
} from "@/lib/validations";

describe("eventSlugSchema", () => {
  it("accepts a valid event- prefixed slug", () => {
    const result = eventSlugSchema.safeParse("event-my-conference-2024");
    expect(result.success).toBe(true);
  });

  it("rejects slugs that do not start with event-", () => {
    const result = eventSlugSchema.safeParse("conference-2024");
    expect(result.success).toBe(false);
    expect(result.error!.issues[0].message).toMatch(/event-/);
  });

  it("rejects slugs with uppercase letters", () => {
    const result = eventSlugSchema.safeParse("event-MyConference");
    expect(result.success).toBe(false);
  });

  it("rejects slugs with trailing hyphens", () => {
    const result = eventSlugSchema.safeParse("event-foo-");
    expect(result.success).toBe(false);
  });
});

describe("createEventSchema", () => {
  const validInput = {
    title: "Annual Conference",
    slug: "event-annual-conference",
    eventDate: "2024-06-15",
  };

  it("accepts valid input with required fields only", () => {
    const result = createEventSchema.safeParse(validInput);
    expect(result.success).toBe(true);
  });

  it("accepts valid input with all optional fields", () => {
    const result = createEventSchema.safeParse({
      ...validInput,
      description: "A great conference",
      category: "Science",
      relatedArticleSlugs: "article-foo, article-bar",
    });
    expect(result.success).toBe(true);
  });

  it("rejects missing title", () => {
    const result = createEventSchema.safeParse({
      slug: "event-foo",
      eventDate: "2024-06-15",
    });
    expect(result.success).toBe(false);
    expect(result.error!.flatten().fieldErrors).toHaveProperty("title");
  });

  it("rejects slug without event- prefix", () => {
    const result = createEventSchema.safeParse({
      title: "Foo",
      slug: "conference-2024",
      eventDate: "2024-06-15",
    });
    expect(result.success).toBe(false);
    expect(result.error!.flatten().fieldErrors).toHaveProperty("slug");
  });

  it("rejects an invalid date string", () => {
    const result = createEventSchema.safeParse({
      title: "Foo",
      slug: "event-foo",
      eventDate: "not-a-date",
    });
    expect(result.success).toBe(false);
    expect(result.error!.flatten().fieldErrors).toHaveProperty("eventDate");
  });

  it("rejects title longer than 200 characters", () => {
    const result = createEventSchema.safeParse({
      ...validInput,
      title: "x".repeat(201),
    });
    expect(result.success).toBe(false);
    expect(result.error!.flatten().fieldErrors).toHaveProperty("title");
  });
});

describe("updateEventSchema", () => {
  it("coerces string id to number", () => {
    const result = updateEventSchema.safeParse({
      id: "42",
      title: "Updated Conference",
      slug: "event-updated-conference",
      eventDate: "2024-07-01",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.id).toBe(42);
    }
  });

  it("rejects missing id", () => {
    const result = updateEventSchema.safeParse({
      title: "Foo",
      slug: "event-foo",
      eventDate: "2024-06-15",
    });
    expect(result.success).toBe(false);
    expect(result.error!.flatten().fieldErrors).toHaveProperty("id");
  });
});

describe("deleteEventSchema", () => {
  it("accepts valid id and slug", () => {
    const result = deleteEventSchema.safeParse({ id: "5", slug: "event-foo" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.id).toBe(5);
      expect(result.data.slug).toBe("event-foo");
    }
  });

  it("rejects zero id", () => {
    const result = deleteEventSchema.safeParse({ id: "0", slug: "event-foo" });
    expect(result.success).toBe(false);
  });

  it("rejects empty slug", () => {
    const result = deleteEventSchema.safeParse({ id: "1", slug: "" });
    expect(result.success).toBe(false);
  });
});

describe("createEventSchema recurrence validation", () => {
  const validInput = {
    title: "Seminar",
    slug: "event-seminar",
    eventDate: "2024-01-01",
  };

  it("accepts a non-recurring event (default)", () => {
    const result = createEventSchema.safeParse(validInput);
    expect(result.success).toBe(true);
  });

  it("accepts weekly frequency on a normal event", () => {
    const result = createEventSchema.safeParse({
      ...validInput,
      recurrenceFrequency: "weekly",
      recurrenceCount: "10",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.recurrenceFrequency).toBe("weekly");
      expect(result.data.recurrenceCount).toBe(10);
    }
  });

  it("rejects weekly frequency on an era start marker", () => {
    const result = createEventSchema.safeParse({
      ...validInput,
      isEraStart: "on",
      eraName: "Cold War Era",
      recurrenceFrequency: "weekly",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const msgs = result.error.issues.map((i) => i.message);
      expect(msgs.some((m) => m.includes("Era marker events cannot recur"))).toBe(true);
    }
  });

  it("rejects non-none frequency on an era end marker", () => {
    const result = createEventSchema.safeParse({
      ...validInput,
      isEraEnd: "on",
      eraName: "Cold War Era",
      recurrenceFrequency: "annually",
    });
    expect(result.success).toBe(false);
  });

  it("accepts 'none' frequency on an era marker", () => {
    const result = createEventSchema.safeParse({
      ...validInput,
      isEraStart: "on",
      eraName: "Cold War Era",
      recurrenceFrequency: "none",
    });
    expect(result.success).toBe(true);
  });
});

describe("setVisibilitySchema with event resourceType", () => {
  it("accepts resourceType 'event'", () => {
    const result = setVisibilitySchema.safeParse({
      resourceType: "event",
      ownerType: "user",
      ownerId: 1,
      resourceKey: "event-foo",
      visibility: "public",
    });
    expect(result.success).toBe(true);
  });

  it("still accepts resourceType 'article'", () => {
    const result = setVisibilitySchema.safeParse({
      resourceType: "article",
      ownerType: "user",
      ownerId: 1,
      resourceKey: "article-foo",
      visibility: "private",
    });
    expect(result.success).toBe(true);
  });
});

describe("addAccessGrantSchema with event resourceType", () => {
  it("accepts resourceType 'event'", () => {
    const result = addAccessGrantSchema.safeParse({
      resourceType: "event",
      ownerType: "org",
      ownerId: 2,
      resourceKey: "event-bar",
      granteeType: "user",
      granteeId: 10,
    });
    expect(result.success).toBe(true);
  });
});
