import { vi } from "vitest";

/**
 * Sets up a queue of select responses for the mock db.select.
 * Each queue item can be a plain array result (resolves directly) or
 * an object with `result` and `withLimit` to control whether the chain
 * terminates at `.where()` or `.where().limit()`.
 */
export function setupSelectQueue(
  mockSelect: ReturnType<typeof vi.fn>,
  queue: Array<{ result: unknown[]; withLimit?: boolean }>,
): void {
  let idx = 0;
  mockSelect.mockImplementation(() => {
    const item = queue[idx++] ?? { result: [], withLimit: true };
    const limitFn = vi.fn().mockResolvedValue(item.result);
    const whereFn = vi.fn();
    if (item.withLimit) {
      whereFn.mockReturnValue({ limit: limitFn });
    } else {
      whereFn.mockResolvedValue(item.result);
    }
    const fromFn = vi.fn().mockReturnValue({ where: whereFn });
    return { from: fromFn };
  });
}

/**
 * Sets up the insert mock chain: insert → values → returning.
 * Returns the mock functions so tests can inspect call arguments.
 */
export function setupInsertQueue(
  mockInsert: ReturnType<typeof vi.fn>,
  mockInsertValues: ReturnType<typeof vi.fn>,
  mockInsertReturning: ReturnType<typeof vi.fn>,
  returnedRow: { id: number; slug: string },
): void {
  mockInsertReturning.mockResolvedValue([returnedRow]);
  mockInsertValues.mockReturnValue({ returning: mockInsertReturning });
  mockInsert.mockReturnValue({ values: mockInsertValues });
}

/**
 * Sets up the update mock chain: update → set → where.
 */
export function setupUpdateQueue(
  mockUpdate: ReturnType<typeof vi.fn>,
  mockUpdateSet: ReturnType<typeof vi.fn>,
  mockUpdateWhere: ReturnType<typeof vi.fn>,
): void {
  mockUpdateWhere.mockResolvedValue({ rowCount: 1 });
  mockUpdateSet.mockReturnValue({ where: mockUpdateWhere });
  mockUpdate.mockReturnValue({ set: mockUpdateSet });
}

/**
 * Sets up the delete mock chain: delete → where.
 */
export function setupDeleteQueue(
  mockDelete: ReturnType<typeof vi.fn>,
  mockDeleteWhere: ReturnType<typeof vi.fn>,
): void {
  mockDeleteWhere.mockResolvedValue({ rowCount: 1 });
  mockDelete.mockReturnValue({ where: mockDeleteWhere });
}
