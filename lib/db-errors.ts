/**
 * True when a database error is a Postgres unique-constraint violation
 * (SQLSTATE 23505). Drivers differ in where they surface the code, so both
 * the error and its cause are checked, with the message as a fallback.
 */
export function isUniqueViolation(err: unknown): boolean {
  if (typeof err !== "object" || err === null) return false;
  const e = err as { code?: string; message?: string; cause?: { code?: string } };
  return (
    e.code === "23505" ||
    e.cause?.code === "23505" ||
    (typeof e.message === "string" && e.message.includes("duplicate key"))
  );
}
