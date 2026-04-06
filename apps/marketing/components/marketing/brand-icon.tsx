import type { ComponentPropsWithoutRef } from "react";

import type { SimpleIcon } from "simple-icons";

type BrandIconProps = Omit<ComponentPropsWithoutRef<"svg">, "children"> & {
  icon: SimpleIcon;
  title?: string;
};

export function BrandIcon({ icon, title, ...props }: BrandIconProps) {
  const accessibleTitle = title ?? icon.title;

  return (
    <svg role="img" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" {...props}>
      <title>{accessibleTitle}</title>
      <path d={icon.path} fill="currentColor" />
    </svg>
  );
}
