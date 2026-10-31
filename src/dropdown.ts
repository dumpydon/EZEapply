/** Values need case/punctuation normalization, without label-specific camelCase
 * splitting or removal of words such as "required" and "optional". */
export function normalizeOption(value: string): string {
  return value
    .normalize('NFKC')
    .toLocaleLowerCase('en')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

/** Placeholder labels are prompts, even when an ATS stores them as "-1" or
 * another nonempty value. Keep real answers such as None, Other and No intact. */
export function isDropdownPlaceholder(label: string | null | undefined): boolean {
  const text = normalizeOption(label || '');
  return (
    !text ||
    /^(?:(?:please|kindly) )?(?:(?:select|choose|pick)(?: (?:one|(?:a|an|your) (?:option|value|selection)|option|value))?|make (?:a |your )?selection|search(?: and select| or select| for an option)?|select or search|none selected|no (?:option|value|selection) selected)$/.test(
      text,
    )
  );
}
