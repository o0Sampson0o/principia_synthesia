"use client";

import { useState } from "react";
import CitationModal from "./CitationModal";
import type { CitationInput } from "@/lib/citations";

type Props = Omit<CitationInput, "accessedAt">;

export default function CiteButton(props: Props) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="ps-quiet-action"
        style={{ fontSize: "0.8125rem" }}
      >
        Cite
      </button>

      {open && <CitationModal {...props} onClose={() => setOpen(false)} />}
    </>
  );
}
