"use server";

import { readdir, readFile } from "fs/promises";
import path from "path";
import { db } from "@/db";
import { objects } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { getSession } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { pluginManifestSchema, type PluginManifest } from "@/lib/validations";
import { validateAnimationScript } from "@/lib/validate-animation";

const PLUGINS_DIR = path.join(process.cwd(), "plugins", "animations");

export type DiscoveredPlugin = {
  slug: string;
  name: string;
  version: string;
  description?: string;
  author?: string;
  tags?: string[];
  license?: string;
  status: "not_installed" | "installed" | "update_available";
};

export type ScanDiscovery =
  | { plugins: DiscoveredPlugin[]; skipped: { slug: string; reason: string }[] }
  | { warning: string }
  | { error: string };

export type InstallResult = { ok: true } | { error: string };

/**
 * Scans `plugins/animations/` for plugin directories, validates each manifest
 * and animation code, then returns a discovery list showing install status
 * for each valid plugin. Does NOT install anything. Requires an admin session.
 */
export async function scanPlugins(): Promise<ScanDiscovery> {
  const session = await getSession();
  if (!session?.isAdmin) return { error: "Unauthorized" };

  // Read the plugins directory — return a warning if it doesn't exist
  let dirs: string[];
  try {
    dirs = await readdir(PLUGINS_DIR);
  } catch {
    return { warning: "plugins/animations/ directory not found" };
  }

  // Fetch all installed plugin rows to check versions
  const installedRows = await db
    .select({ slug: objects.slug, pluginMeta: objects.pluginMeta })
    .from(objects)
    .where(and(eq(objects.type, "animation"), eq(objects.source, "plugin")));

  const installedVersions = new Map<string, string>();
  for (const row of installedRows) {
    const meta = row.pluginMeta as Record<string, unknown> | null;
    const version = typeof meta?.version === "string" ? meta.version : "";
    installedVersions.set(row.slug, version);
  }

  const plugins: DiscoveredPlugin[] = [];
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

    // Determine install status
    let status: DiscoveredPlugin["status"];
    if (!installedVersions.has(manifest.slug)) {
      status = "not_installed";
    } else if (installedVersions.get(manifest.slug) === manifest.version) {
      status = "installed";
    } else {
      status = "update_available";
    }

    plugins.push({
      slug: manifest.slug,
      name: manifest.name,
      version: manifest.version,
      description: manifest.description,
      author: manifest.author,
      tags: manifest.tags,
      license: manifest.license,
      status,
    });
  }

  return { plugins, skipped };
}

/**
 * Reads, validates, and installs (upserts) a single plugin from disk.
 * Requires an admin session.
 */
export async function installPlugin(slug: string): Promise<InstallResult> {
  const session = await getSession();
  if (!session?.isAdmin) return { error: "Unauthorized" };

  const dirPath = path.join(PLUGINS_DIR, slug);

  // Read manifest.json
  let rawManifest: string;
  try {
    rawManifest = await readFile(path.join(dirPath, "manifest.json"), "utf-8");
  } catch {
    return { error: "manifest.json not found" };
  }

  // Parse JSON
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawManifest);
  } catch {
    return { error: "manifest.json is invalid JSON" };
  }

  // Validate manifest schema
  const manifestResult = pluginManifestSchema.safeParse(parsed);
  if (!manifestResult.success) {
    const reason = manifestResult.error.issues[0]?.message ?? "Invalid manifest";
    return { error: `Manifest validation failed: ${reason}` };
  }

  const manifest: PluginManifest = manifestResult.data;

  // Slug must match directory name
  if (manifest.slug !== slug) {
    return {
      error: `Manifest slug "${manifest.slug}" does not match directory name "${slug}"`,
    };
  }

  // Read entrypoint
  let code: string;
  try {
    code = await readFile(path.join(dirPath, manifest.entrypoint), "utf-8");
  } catch {
    return { error: `Entrypoint "${manifest.entrypoint}" not found` };
  }

  // Validate animation code
  const validation = validateAnimationScript(code);
  if (!validation.ok) {
    return { error: `Code validation failed: ${validation.reason}` };
  }

  const pluginMeta = {
    version: manifest.version,
    description: manifest.description,
    author: manifest.author,
    tags: manifest.tags,
    license: manifest.license,
  };

  // Upsert: check if row exists
  const existing = await db
    .select({ id: objects.id })
    .from(objects)
    .where(and(eq(objects.slug, manifest.slug), eq(objects.type, "animation")))
    .limit(1);

  if (existing.length > 0) {
    await db
      .update(objects)
      .set({
        name: manifest.name,
        content: { code },
        source: "plugin",
        pluginMeta,
        updatedAt: new Date(),
      })
      .where(eq(objects.id, existing[0].id));
  } else {
    await db.insert(objects).values({
      slug: manifest.slug,
      name: manifest.name,
      type: "animation",
      content: { code },
      source: "plugin",
      pluginMeta,
    });
  }

  revalidatePath("/admin/objects/plugins");
  revalidatePath("/admin/objects");

  return { ok: true };
}

/**
 * Removes a plugin animation object from `objects`. Only deletes rows where
 * `type = "animation"` and `source = "plugin"` to prevent accidental deletion
 * of user-created animations. Requires an admin session.
 */
export async function uninstallPlugin(slug: string): Promise<{ ok: boolean } | { error: string }> {
  const session = await getSession();
  if (!session?.isAdmin) return { error: "Unauthorized" };

  await db
    .delete(objects)
    .where(and(
      eq(objects.slug, slug),
      eq(objects.type, "animation"),
      eq(objects.source, "plugin"),
    ));

  return { ok: true };
}
