import Link from 'next/link';
import type { ReactNode } from 'react';

type MarketingLinkProps = {
  children: ReactNode;
  className?: string;
  href: string;
  newTab?: boolean;
};

function isExternalHref(href: string): boolean {
  return href.startsWith('http://') || href.startsWith('https://');
}

export function MarketingLink({
  children,
  className,
  href,
  newTab = isExternalHref(href),
}: MarketingLinkProps) {
  if (isExternalHref(href)) {
    return (
      <a
        className={className}
        href={href}
        rel="noreferrer"
        target={newTab ? '_blank' : undefined}
      >
        {children}
      </a>
    );
  }

  return (
    <Link className={className} href={href}>
      {children}
    </Link>
  );
}
