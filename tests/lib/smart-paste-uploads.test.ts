import { describe, it, expect } from "vitest";
import { transformPaste, latexToMath, titleFromFilename } from "@/lib/smart-paste";
import { buildUploadPath, parseUploadPath } from "@/lib/uploads";
import { pdfEmbed } from "@/lib/pdf-embed";
import { matchMentionQuery } from "@/lib/link-target-format";

const U = "0b1c2d3e-4f50-4a6b-8c7d-9e0f1a2b3c4d";

describe("transformPaste", () => {
  it("links selected text to a pasted URL", () => {
    expect(transformPaste("https://example.com/x", "this")).toBe("[this](https://example.com/x)");
  });
  it("labels arXiv and DOI links", () => {
    expect(transformPaste("https://arxiv.org/abs/2401.01234v2", "")).toBe("[arXiv:2401.01234v2](https://arxiv.org/abs/2401.01234v2)");
    expect(transformPaste("https://doi.org/10.1103/PhysRev.47.777", "")).toBe("[doi:10.1103/PhysRev.47.777](https://doi.org/10.1103/PhysRev.47.777)");
    expect(transformPaste("10.1103/PhysRev.47.777", "")).toBe("[doi:10.1103/PhysRev.47.777](https://doi.org/10.1103/PhysRev.47.777)");
  });
  it("leaves ordinary text and plain URLs alone", () => {
    expect(transformPaste("hello world", "")).toBeNull();
    expect(transformPaste("https://example.com", "")).toBeNull();
  });
});

describe("latexToMath", () => {
  it("converts display and inline LaTeX", () => {
    expect(latexToMath("\\[ E = mc^2 \\]")).toBe("$$\nE = mc^2\n$$");
    expect(latexToMath("\\begin{align} a &= b \\end{align}")).toBe("$$\n\\begin{align} a &= b \\end{align}\n$$");
    expect(latexToMath("\\(x^2\\)")).toBe("$x^2$");
    expect(latexToMath("costs $5")).toBeNull();
  });
});

describe("uploads", () => {
  it("builds and recognises image and PDF paths, rejecting other types", () => {
    const img = buildUploadPath("image", "alice", { name: "a.png", type: "image/png" }, U)!;
    expect(parseUploadPath(img)).toEqual({ kind: "image", publisher: "alice" });
    const pdf = buildUploadPath("file", "alice", { name: "Griffiths EM (4th).pdf", type: "application/pdf" }, U)!;
    expect(pdf).toBe(`files/alice/${U}/griffiths-em-4th.pdf`);
    expect(parseUploadPath(pdf)).toEqual({ kind: "file", publisher: "alice" });
    expect(buildUploadPath("file", "alice", { name: "x.exe", type: "application/x-msdownload" }, U)).toBeNull();
    expect(parseUploadPath("files/alice/../secret.pdf")).toBeNull();
  });
  it("titles pasted screenshots", () => {
    expect(titleFromFilename("image.png")).toBe("Screenshot");
    expect(titleFromFilename("lecture_notes-3.pdf")).toBe("lecture notes 3");
  });
});

describe("pdfEmbed", () => {
  it("accepts our files and https, adds the page, clamps height", () => {
    const e = pdfEmbed({ src: `/api/files/alice/${U}/notes.pdf`, page: "12", height: 99999 })!;
    expect(e.href).toBe(`/api/files/alice/${U}/notes.pdf#page=12`);
    expect(e.height).toBe(1400);
    expect(e.title).toBe("notes");
    expect(pdfEmbed({ src: "javascript:alert(1)" })).toBeNull();
    expect(pdfEmbed({ src: "http://insecure/x.pdf" })).toBeNull();
  });
});

describe("matchMentionQuery", () => {
  it("fires at a word start, not inside emails", () => {
    expect(matchMentionQuery("see @Gali")).toEqual({ query: "Gali", start: 4 });
    expect(matchMentionQuery("mail a@b")).toBeNull();
    expect(matchMentionQuery("just @")).toBeNull();
  });
});
