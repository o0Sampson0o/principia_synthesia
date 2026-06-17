import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { checkGrammar } from "@/lib/grammar";

export const runtime = "nodejs";

/**
 * Grammar / spell check for the article editor. Accepts the raw MDX source and
 * returns prose issues with source offsets. Auth-gated: only signed-in users
 * (i.e. people who can reach an editor) may call it.
 */
export async function POST(req: Request): Promise<Response> {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let content: unknown;
  try {
    ({ content } = await req.json());
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (typeof content !== "string") {
    return NextResponse.json({ error: "Expected `content` string" }, { status: 400 });
  }

  const messages = await checkGrammar(content);
  return NextResponse.json({ messages });
}
