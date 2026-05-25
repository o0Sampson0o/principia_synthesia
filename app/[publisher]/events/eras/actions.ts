"use server";

import { db } from "@/db";
import { events } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { revalidatePath, revalidateTag } from "next/cache";
import { redirect } from "next/navigation";
import { assertEditRights } from "@/app/[publisher]/articles/actions";
import { eraToSlug } from "@/lib/timeline-utils";
import {
  createEraSchema,
  renameEraSchema,
  updateEraSchema,
  deleteEraSchema,
} from "@/lib/validations";

function revalidateAll(publisherSlug: string) {
  revalidatePath("/timeline");
  revalidatePath(`/${publisherSlug}/events`);
  revalidatePath(`/${publisherSlug}/events/eras`);
  revalidateTag("timeline", "default");
}

export async function createEra(
  publisherSlug: string,
  _prevState: unknown,
  formData: FormData
) {
  const { ownerType, ownerId } = await assertEditRights(publisherSlug);

  const parsed = createEraSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { errors: parsed.error.flatten().fieldErrors };

  const { name, startDate, endDate, description } = parsed.data;
  const slug = eraToSlug(name);

  await db.transaction(async (tx) => {
    await tx.insert(events).values({
      slug: `event-era-${slug}-start`,
      title: `${name} (start)`,
      description: description ?? null,
      eventDate: new Date(startDate),
      isEraStart: true,
      isEraEnd: false,
      eraName: name,
      ownerType,
      ownerId,
    });

    if (endDate && !Number.isNaN(Date.parse(endDate))) {
      await tx.insert(events).values({
        slug: `event-era-${slug}-end`,
        title: `${name} (end)`,
        description: null,
        eventDate: new Date(endDate),
        isEraStart: false,
        isEraEnd: true,
        eraName: name,
        ownerType,
        ownerId,
      });
    }
  });

  revalidateAll(publisherSlug);
  redirect(`/${publisherSlug}/events/eras/${slug}`);
}

export async function renameEra(
  publisherSlug: string,
  _prevState: unknown,
  formData: FormData
) {
  const { ownerType, ownerId } = await assertEditRights(publisherSlug);

  const parsed = renameEraSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { errors: parsed.error.flatten().fieldErrors };

  const { currentName, newName } = parsed.data;
  const oldSlug = eraToSlug(currentName);
  const newSlug = eraToSlug(newName);
  const now = new Date();

  await db.transaction(async (tx) => {
    await tx
      .update(events)
      .set({ eraName: newName, updatedAt: now })
      .where(
        and(
          eq(events.eraName, currentName),
          eq(events.ownerType, ownerType),
          eq(events.ownerId, ownerId)
        )
      );

    await tx
      .update(events)
      .set({ slug: `event-era-${newSlug}-start`, updatedAt: now })
      .where(
        and(
          eq(events.slug, `event-era-${oldSlug}-start`),
          eq(events.ownerType, ownerType),
          eq(events.ownerId, ownerId)
        )
      );

    await tx
      .update(events)
      .set({ slug: `event-era-${newSlug}-end`, updatedAt: now })
      .where(
        and(
          eq(events.slug, `event-era-${oldSlug}-end`),
          eq(events.ownerType, ownerType),
          eq(events.ownerId, ownerId)
        )
      );
  });

  revalidateAll(publisherSlug);
  redirect(`/${publisherSlug}/events/eras/${newSlug}`);
}

export async function updateEra(
  publisherSlug: string,
  _prevState: unknown,
  formData: FormData
) {
  const { ownerType, ownerId } = await assertEditRights(publisherSlug);

  const parsed = updateEraSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { errors: parsed.error.flatten().fieldErrors };

  const { startEventId, startDate, endEventId, endDate } = parsed.data;

  await db
    .update(events)
    .set({ eventDate: new Date(startDate), updatedAt: new Date() })
    .where(
      and(
        eq(events.id, startEventId),
        eq(events.ownerType, ownerType),
        eq(events.ownerId, ownerId)
      )
    );

  if (endEventId && endDate && !Number.isNaN(Date.parse(endDate))) {
    await db
      .update(events)
      .set({ eventDate: new Date(endDate), updatedAt: new Date() })
      .where(
        and(
          eq(events.id, endEventId),
          eq(events.ownerType, ownerType),
          eq(events.ownerId, ownerId)
        )
      );
  }

  revalidateAll(publisherSlug);
  return { success: true } as const;
}

export async function deleteEra(
  publisherSlug: string,
  formData: FormData
) {
  const { ownerType, ownerId } = await assertEditRights(publisherSlug);

  const parsed = deleteEraSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return;

  const { startEventId, endEventId } = parsed.data;

  const idsToDelete = [startEventId, ...(endEventId ? [endEventId] : [])];

  for (const id of idsToDelete) {
    await db
      .delete(events)
      .where(
        and(
          eq(events.id, id),
          eq(events.ownerType, ownerType),
          eq(events.ownerId, ownerId)
        )
      );
  }

  revalidateAll(publisherSlug);
  redirect(`/${publisherSlug}/events/eras`);
}
