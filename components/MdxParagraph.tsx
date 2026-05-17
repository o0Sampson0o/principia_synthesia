import { Children, isValidElement, type ReactNode } from "react";

export default function MdxParagraph({
  children,
  ...props
}: {
  children?: ReactNode;
  [key: string]: unknown;
}) {
  const hasBlockChild = Children.toArray(children).some(
    (child) => isValidElement(child) && typeof child.type !== "string"
  );
  return hasBlockChild ? (
    <div {...(props as React.HTMLAttributes<HTMLDivElement>)}>{children}</div>
  ) : (
    <p {...(props as React.HTMLAttributes<HTMLParagraphElement>)}>{children}</p>
  );
}
