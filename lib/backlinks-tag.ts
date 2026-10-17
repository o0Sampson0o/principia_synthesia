/**
 * Cache tag for the "Linked from" lists (lib/backlinks.ts). Its own module so
 * article write paths can invalidate it without importing the cached query.
 */
export const BACKLINKS_TAG = "backlinks";
