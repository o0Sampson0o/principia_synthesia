"use client";

import AnimationEditForm from "../AnimationEditForm";
import DatasetEditForm from "../DatasetEditForm";
import DiagramEditForm from "../DiagramEditForm";

interface KaoObject {
  id: number;
  slug: string;
  name: string;
  type: string;
  content: unknown;
  description: string | null;
}

interface Props {
  object: KaoObject;
}

export default function EditKaoForm({ object }: Props) {
  if (object.type === "animation") return <AnimationEditForm object={object} />;
  if (object.type === "dataset") return <DatasetEditForm object={object} />;
  if (object.type === "diagram") return <DiagramEditForm object={object} />;
  return <p className="text-sm text-zinc-500">Unknown object type: {object.type}</p>;
}
