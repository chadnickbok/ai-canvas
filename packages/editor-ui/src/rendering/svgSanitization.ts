type SvgAttributeValue = boolean | number | string;

const BLOCKED_SVG_ELEMENT_NAMES = new Set(['foreignobject', 'script']);
const URL_SVG_ATTRIBUTE_NAMES = new Set(['href', 'xlink:href']);

function isBlockedSvgAttributeName(name: string): boolean {
  return name.toLowerCase().startsWith('on');
}

function isBlockedSvgAttributeValue(
  name: string,
  value: SvgAttributeValue,
): boolean {
  if (!URL_SVG_ATTRIBUTE_NAMES.has(name.toLowerCase())) {
    return false;
  }

  return (
    typeof value === 'string' &&
    value.trim().toLowerCase().startsWith('javascript:')
  );
}

function stripUnsafeSvgMarkup(markup: string): string {
  return markup
    .replace(/<\s*script\b[^>]*>[\s\S]*?<\s*\/\s*script\s*>/gi, '')
    .replace(
      /<\s*foreignObject\b[^>]*>[\s\S]*?<\s*\/\s*foreignObject\s*>/gi,
      '',
    )
    .replace(/\son[a-z-]+\s*=\s*(?:"[^"]*"|'[^']*')/gi, '')
    .replace(
      /\s(?:href|xlink:href)\s*=\s*(?:"javascript:[^"]*"|'javascript:[^']*')/gi,
      '',
    );
}

function sanitizeSvgTree(element: Element): void {
  for (const attribute of [...element.attributes]) {
    if (
      isBlockedSvgAttributeName(attribute.name) ||
      isBlockedSvgAttributeValue(attribute.name, attribute.value)
    ) {
      element.removeAttribute(attribute.name);
    }
  }

  for (const child of [...element.children]) {
    if (BLOCKED_SVG_ELEMENT_NAMES.has(child.tagName.toLowerCase())) {
      child.remove();
      continue;
    }

    sanitizeSvgTree(child);
  }
}

export function sanitizeSvgAttributeBag(
  attributes: Record<string, SvgAttributeValue>,
): Record<string, SvgAttributeValue> {
  const sanitizedEntries = Object.entries(attributes).filter(
    ([name, value]) =>
      !isBlockedSvgAttributeName(name) &&
      !isBlockedSvgAttributeValue(name, value),
  );

  return Object.fromEntries(sanitizedEntries);
}

export function sanitizeSvgElementName(elementName: string): string | null {
  const normalizedName = elementName.trim().toLowerCase();

  if (!/^[a-z][a-z0-9:_-]*$/i.test(normalizedName)) {
    return null;
  }

  if (BLOCKED_SVG_ELEMENT_NAMES.has(normalizedName)) {
    return null;
  }

  return normalizedName;
}

export function sanitizeSvgDefinitionsMarkup(markup: string): string {
  if (typeof DOMParser === 'undefined') {
    return stripUnsafeSvgMarkup(markup);
  }

  const parser = new DOMParser();
  const parsed = parser.parseFromString(
    `<svg xmlns="http://www.w3.org/2000/svg"><defs>${markup}</defs></svg>`,
    'image/svg+xml',
  );

  if (parsed.querySelector('parsererror')) {
    return '';
  }

  const defsElement = parsed.documentElement.querySelector('defs');

  if (!defsElement) {
    return '';
  }

  sanitizeSvgTree(defsElement);
  return defsElement.innerHTML;
}
