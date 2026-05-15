export type KaoType = "animation" | "dataset" | "diagram";

export interface AnimationContent { code: string }
export interface DatasetContent { headers: string[]; rows: unknown[][] }
export interface DiagramContent { format: "mermaid" | "graphviz"; source: string }
export type KaoContent = AnimationContent | DatasetContent | DiagramContent;

export function isAnimationContent(c: KaoContent): c is AnimationContent {
  return "code" in c;
}
export function isDatasetContent(c: KaoContent): c is DatasetContent {
  return "headers" in c && "rows" in c;
}
export function isDiagramContent(c: KaoContent): c is DiagramContent {
  return "format" in c && "source" in c;
}
