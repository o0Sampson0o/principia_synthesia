import { unified, type Processor } from "unified";
import type { Root as NlcstRoot } from "nlcst";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import remarkFrontmatter from "remark-frontmatter";
import remarkRetext from "remark-retext";
import retextEnglish from "retext-english";
import retextSpell from "retext-spell";
import retextRepeatedWords from "retext-repeated-words";
import retextIndefiniteArticle from "retext-indefinite-article";
import retextRedundantAcronyms from "retext-redundant-acronyms";
import dictionaryEn from "dictionary-en";
import { VFile } from "vfile";

// ---------------------------------------------------------------------------
// Grammar / spell checking for the article editor.
//
// The same idea LTeX uses: parse the markup, check only the prose, and report
// issues back at the right source positions. We reuse the existing remark
// pipeline and bridge it to the retext (natural-language) ecosystem via
// `remark-retext`. Frontmatter, math (`$…$`), code and other non-prose nodes
// are never converted to text, so they aren't flagged — and message positions
// map back to offsets in the original MDX source.
//
// Pure JS, no external API and no Java: safe to run inside a Vercel function.
// ---------------------------------------------------------------------------

export interface GrammarMessage {
  /** Inclusive start offset in the source. */
  from: number;
  /** Exclusive end offset in the source. */
  to: number;
  /** Human-readable description of the issue. */
  reason: string;
  /** Rule that produced the message (e.g. `retext-spell`), if any. */
  ruleId: string | null;
  /** Plugin source (e.g. `retext-spell`), if any. */
  source: string | null;
  /** Suggested replacements (spelling), if any. */
  expected: string[];
}

/** Hard cap so a runaway document can't pin the function's CPU. */
const MAX_CHARS = 80_000;

function buildProcessor() {
  // English natural-language processor whose plugins emit the prose issues.
  const nlcstProcessor = unified()
    .use(retextEnglish)
    .use(retextSpell, { dictionary: dictionaryEn })
    .use(retextRepeatedWords)
    .use(retextIndefiniteArticle)
    .use(retextRedundantAcronyms);

  return unified()
    .use(remarkParse)
    .use(remarkFrontmatter, ["yaml"])
    .use(remarkGfm)
    .use(remarkMath)
    // `remark-retext`'s types expect a parse-only processor; ours carries the
    // retext transformers (which is exactly the bridge mode it supports at
    // runtime), so the generics are narrowed with a cast.
    .use(
      remarkRetext,
      nlcstProcessor as unknown as Processor<NlcstRoot, undefined, undefined, undefined, undefined>
    );
}

// Reused across invocations on a warm function instance. The processor is
// stateless per run (state travels with the file/tree), and retext-spell keeps
// a suggestion cache here that makes repeated checks faster.
let processor: ReturnType<typeof buildProcessor> | null = null;

export async function checkGrammar(content: string): Promise<GrammarMessage[]> {
  const source = content.length > MAX_CHARS ? content.slice(0, MAX_CHARS) : content;
  processor ??= buildProcessor();

  const file = new VFile({ value: source });
  const tree = processor.parse(file);
  await processor.run(tree, file);

  const messages: GrammarMessage[] = [];
  for (const msg of file.messages) {
    const place = msg.place;
    let from: number | undefined;
    let to: number | undefined;
    if (place && "start" in place) {
      from = place.start.offset;
      to = place.end?.offset;
    } else if (place && "offset" in place) {
      from = place.offset;
      to = place.offset;
    }
    if (typeof from !== "number") continue;
    if (typeof to !== "number") to = from;

    const extra = msg as typeof msg & { expected?: unknown };
    const expected = Array.isArray(extra.expected)
      ? extra.expected.filter((x): x is string => typeof x === "string")
      : [];

    messages.push({
      from,
      to,
      reason: msg.reason,
      ruleId: msg.ruleId ?? null,
      source: msg.source ?? null,
      expected,
    });
  }
  return messages;
}
