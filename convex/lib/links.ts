/** An ordinary web address, given its https:// when that was left out. "" when it is not one. */
export const webAddress = (text: string): string =>
  /^https?:\/\//i.test(text) ? text : /^[a-z0-9-]+(\.[a-z0-9-]+)+(\/|$)/i.test(text) ? `https://${text}` : "";

/** The same for a link that is kept as it is typed: one address and nothing else. */
export const webLink = (value: string): string => (/[\s<>"]/.test(value.trim()) ? "" : webAddress(value.trim()));
