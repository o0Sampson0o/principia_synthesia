export type QueuedSubmission = {
  id: string;
  timestamp: number;
  pageUrl: string;
  action: string;
  fields: [string, string][];
  label: string;
};

const KEY = "ps_offline_queue";

export function getQueue(): QueuedSubmission[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "[]");
  } catch {
    return [];
  }
}

export function enqueue(item: Omit<QueuedSubmission, "id" | "timestamp">): QueuedSubmission {
  const entry: QueuedSubmission = { ...item, id: crypto.randomUUID(), timestamp: Date.now() };
  try {
    localStorage.setItem(KEY, JSON.stringify([...getQueue(), entry]));
  } catch {}
  return entry;
}

export function dequeue(id: string): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(getQueue().filter((i) => i.id !== id)));
  } catch {}
}

export function clearQueue(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {}
}
