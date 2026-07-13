import { WidgetType } from "@codemirror/view";

/**
 * Renders a GFM markdown table as an HTML <table> when the selection is not
 * inside it (source shows for editing otherwise — see block-table.ts). Styled
 * to match `.markdown-content table` on the published page.
 */

type Align = "left" | "center" | "right" | null;

interface ParsedTable {
  headers: string[];
  aligns: Align[];
  rows: string[][];
}

/** Split a table row on unescaped pipes, dropping the outer empties. */
function splitCells(line: string): string[] {
  const cells: string[] = [];
  let cur = "";
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === "\\" && i + 1 < line.length) {
      cur += ch + line[i + 1];
      i++;
      continue;
    }
    if (ch === "|") {
      cells.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  cells.push(cur);
  // A leading/trailing pipe produces empty first/last cells — drop them.
  if (cells.length && cells[0].trim() === "") cells.shift();
  if (cells.length && cells[cells.length - 1].trim() === "") cells.pop();
  return cells.map((c) => c.trim());
}

function alignOf(spec: string): Align {
  const s = spec.trim();
  const left = s.startsWith(":");
  const right = s.endsWith(":");
  if (left && right) return "center";
  if (right) return "right";
  if (left) return "left";
  return null;
}

export function parseTable(source: string): ParsedTable | null {
  const lines = source.split(/\r?\n/).filter((l) => l.trim() !== "");
  if (lines.length < 2) return null;
  const headers = splitCells(lines[0]);
  const aligns = splitCells(lines[1]).map(alignOf);
  // The delimiter row must be all dashes/colons.
  if (!splitCells(lines[1]).every((c) => /^:?-+:?$/.test(c.trim()))) return null;
  const rows = lines.slice(2).map(splitCells);
  return { headers, aligns, rows };
}

export class TableWidget extends WidgetType {
  private parsed: ParsedTable | null;
  constructor(readonly source: string) {
    super();
    this.parsed = parseTable(source);
  }
  eq(other: TableWidget): boolean {
    return other.source === this.source;
  }
  toDOM(): HTMLElement {
    const wrap = document.createElement("div");
    wrap.className = "cm-lp-table";
    if (!this.parsed) {
      wrap.textContent = this.source; // unparseable → show raw
      return wrap;
    }
    const table = document.createElement("table");
    const thead = document.createElement("thead");
    const htr = document.createElement("tr");
    this.parsed.headers.forEach((h, i) => {
      const th = document.createElement("th");
      th.textContent = h;
      if (this.parsed!.aligns[i]) th.style.textAlign = this.parsed!.aligns[i]!;
      htr.appendChild(th);
    });
    thead.appendChild(htr);
    table.appendChild(thead);

    const tbody = document.createElement("tbody");
    for (const row of this.parsed.rows) {
      const tr = document.createElement("tr");
      row.forEach((cell, i) => {
        const td = document.createElement("td");
        td.textContent = cell;
        const a = this.parsed!.aligns[i];
        if (a) td.style.textAlign = a;
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    }
    table.appendChild(tbody);
    wrap.appendChild(table);
    return wrap;
  }
  ignoreEvent(): boolean {
    return false;
  }
}
