"use server";

import { storeFor } from "@/lib/uploads-server";
import type { UploadKind } from "@/lib/uploads";

/** The access mode the browser must request when uploading a `kind` (it has to match the store). */
export async function uploadAccess(kind: UploadKind): Promise<"public" | "private"> {
  return storeFor(kind).access;
}
