"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/** A flat bag of editor fields persisted to a draft (always includes `content`). */
export type DraftData = Record<string, string> & { content: string };

export interface DraftSnapshot {
  data: DraftData;
  /** Epoch milliseconds the draft was written. */
  savedAt: number;
}

const PREFIX = "article-draft:";
const AUTOSAVE_DEBOUNCE_MS = 1500;

/**
 * Persists an editor's work to `localStorage` so it survives a frozen tab,
 * a lost network connection, or an accidental reload — none of which a
 * server-side save can guarantee.
 *
 * The caller supplies a `storageKey` (scoped per article) and a `getSnapshot`
 * closure that reads the live editor/form values. The hook debounces writes,
 * flushes immediately when the tab is hidden or unloaded (the two moments a
 * browser is most likely to freeze the page), and surfaces any draft found on
 * mount as `restorable` so the UI can offer to recover it.
 */
export function useDraftAutosave({
  storageKey,
  getSnapshot,
}: {
  storageKey: string;
  getSnapshot: () => DraftData;
}) {
  const fullKey = `${PREFIX}${storageKey}`;

  // Keep the latest getSnapshot without re-subscribing event listeners.
  const getSnapshotRef = useRef(getSnapshot);
  useEffect(() => {
    getSnapshotRef.current = getSnapshot;
  }, [getSnapshot]);

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [restorable, setRestorable] = useState<DraftSnapshot | null>(null);
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);

  const write = useCallback(() => {
    try {
      const snapshot: DraftSnapshot = { data: getSnapshotRef.current(), savedAt: Date.now() };
      localStorage.setItem(fullKey, JSON.stringify(snapshot));
      setLastSavedAt(snapshot.savedAt);
    } catch {
      // Quota exceeded / private mode / SSR — autosave is best-effort.
    }
  }, [fullKey]);

  const schedule = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(write, AUTOSAVE_DEBOUNCE_MS);
  }, [write]);

  const clear = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    try {
      localStorage.removeItem(fullKey);
    } catch {
      // ignore
    }
    setRestorable(null);
    setLastSavedAt(null);
  }, [fullKey]);

  // Load any existing draft once on mount so the caller can offer recovery.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(fullKey);
      if (!raw) return;
      const parsed = JSON.parse(raw) as DraftSnapshot;
      if (parsed?.data && typeof parsed.data.content === "string") {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setRestorable(parsed);
      }
    } catch {
      // ignore malformed drafts
    }
  }, [fullKey]);

  // Flush immediately when the tab is backgrounded or unloaded — the moments a
  // browser most often freezes an idle page before any debounce can fire.
  useEffect(() => {
    const flushOnHide = () => {
      if (document.visibilityState === "hidden") write();
    };
    window.addEventListener("pagehide", write);
    document.addEventListener("visibilitychange", flushOnHide);
    return () => {
      window.removeEventListener("pagehide", write);
      document.removeEventListener("visibilitychange", flushOnHide);
    };
  }, [write]);

  return {
    /** Debounced autosave — call on every edit. */
    schedule,
    /** Force an immediate write (used by flush handlers). */
    write,
    /** Delete the stored draft (call after a successful server save). */
    clear,
    /** A draft recovered on mount, or `null` if none exists. */
    restorable,
    /** Hide the recovery prompt without deleting the draft. */
    dismissRestorable: useCallback(() => setRestorable(null), []),
    /** Epoch ms of the most recent autosave this session, or `null`. */
    lastSavedAt,
  };
}
