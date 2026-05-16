export const OPEN_LICENSES: Set<string> = new Set([
  "mit",
  "apache-2.0",
  "bsd-2-clause",
  "bsd-3-clause",
  "isc",
  "cc0-1.0",
  "cc-by-4.0",
]);

export function canViewPluginCode(license: string | null | undefined): boolean {
  if (!license) return false;
  return OPEN_LICENSES.has(license.trim().toLowerCase());
}

export function canClonePlugin(license: string | null | undefined): boolean {
  return canViewPluginCode(license);
}
