"use server";

import { readdir, readFile } from "fs/promises";
import path from "path";
import { db } from "@/db";
import { savedAnimations } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { getSession } from "@/lib/auth";
import { pluginManifestSchema, type PluginManifest } from "@/lib/validations";
import { validateAnimationScript } from "@/lib/validate-animation";

const PLUGINS_DIR = path.join(process.cwd(), "plugins", "animations");

export type ScanResult =
  | { installed: string[]; skipped: { slug: string; reason: string }[] }
  | { warning: string }
  | { error: string };

/**
 * Scans `plugins/animations/` for plugin directories, validates each manifest
 * and animation code, then upserts matching rows in `savedAnimations` with
 * `source: "plugin"`. Requires an admin session.
 */
export async function scanAndInstallPlugins(): Promise<ScanResult> {
  const session = await getSession();
  if (!session?.isAdmin) return { error: "Unauthorized" };

  // Read the plugins directory — return a warning if it doesn't exist
  let dirs: string[];
  try {
    dirs = await readdir(PLUGINS_DIR);
  } catch {
    return { warning: "plugins/animations/ directory not found" };
  }

  const installed: string[] = [];
  const skipped: { slug: string; reason: string }[] = [];

  for (const dir of dirs) {
    const dirPath = path.join(PLUGINS_DIR, dir);

    // Read manifest.json
    let rawManifest: string;
    try {
      rawManifest = await readFile(path.join(dirPath, "manifest.json"), "utf-8");
    } catch {
      skipped.push({ slug: dir, reason: "manifest.json not found" });
      continue;
    }

    // Parse JSON
    let parsed: unknown;
    try {
      parsed = JSON.parse(rawManifest);
    } catch {
      skipped.push({ slug: dir, reason: "manifest.json is invalid JSON" });
      continue;
    }

    // Validate manifest schema
    const manifestResult = pluginManifestSchema.safeParse(parsed);
    if (!manifestResult.success) {
      const reason = manifestResult.error.issues[0]?.message ?? "Invalid manifest";
      skipped.push({ slug: dir, reason: `Manifest validation failed: ${reason}` });
      continue;
    }

    const manifest: PluginManifest = manifestResult.data;

    // Slug must match directory name
    if (manifest.slug !== dir) {
      skipped.push({
        slug: dir,
        reason: `Manifest slug "${manifest.slug}" does not match directory name "${dir}"`,
      });
      continue;
    }

    // Read entrypoint
    let code: string;
    try {
      code = await readFile(path.join(dirPath, manifest.entrypoint), "utf-8");
    } catch {
      skipped.push({ slug: dir, reason: `Entrypoint "${manifest.entrypoint}" not found` });
      continue;
    }

    // Validate animation code
    const validation = validateAnimationScript(code);
    if (!validation.ok) {
      skipped.push({ slug: dir, reason: `Code validation failed: ${validation.reason}` });
      continue;
    }

    // Upsert: check if row exists
    const existing = await db
      .select({ id: savedAnimations.id })
      .from(savedAnimations)
      .where(eq(savedAnimations.slug, manifest.slug))
      .limit(1);

    const pluginMeta = {
      version: manifest.version,
      description: manifest.description,
      author: manifest.author,
      tags: manifest.tags,
      license: manifest.license,
    };

    if (existing.length > 0) {
      await db
        .update(savedAnimations)
        .set({ name: manifest.name, code, source: "plugin", pluginMeta })
        .where(eq(savedAnimations.slug, manifest.slug));
    } else {
      await db.insert(savedAnimations).values({
        slug: manifest.slug,
        name: manifest.name,
        code,
        source: "plugin",
        pluginMeta,
      });
    }

    installed.push(manifest.slug);
  }

  return { installed, skipped };
}

/**
 * Removes a plugin row from `savedAnimations`. Only deletes rows where
 * `source = "plugin"` to prevent accidental deletion of user-created animations.
 * Requires an admin session.
 */
export async function uninstallPlugin(slug: string): Promise<{ ok: boolean } | { error: string }> {
  const session = await getSession();
  if (!session?.isAdmin) return { error: "Unauthorized" };

  await db
    .delete(savedAnimations)
    .where(and(eq(savedAnimations.slug, slug), eq(savedAnimations.source, "plugin")));

  return { ok: true };
}
