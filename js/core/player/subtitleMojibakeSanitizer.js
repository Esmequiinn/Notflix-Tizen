const REPLACEMENTS = [
  ["\u00e2\u2122\u00aa", "\u266a"],
  ["\u00e2\u2122\u00ab", "\u266b"],
  ["\u00e2\u20ac\u2122", "\u2019"],
  ["\u00e2\u20ac\u02dc", "\u2018"],
  ["\u00e2\u20ac\u0153", "\u201c"],
  ["\u00e2\u20ac\u009d", "\u201d"],
  ["\u00e2\u20ac\u009c", "\u201c"],
  ["\u00e2\u20ac\u0098", "\u2018"],
  ["\u00e2\u20ac\u0099", "\u2019"],
  ["\u00e2\u20ac\u201c", "\u2013"],
  ["\u00e2\u20ac\u201d", "\u2014"],
  ["\u00e2\u20ac\u00a6", "\u2026"],
  ["\u00c2\u00a0", " "],
  ["\u00c2\u00bf", "\u00bf"],
  ["\u00c2\u00a1", "\u00a1"],
  ["\u00c2\u00ab", "\u00ab"],
  ["\u00c2\u00bb", "\u00bb"],
  ["\u00c2 ", " "],
  ["\u00e2\u2122", "\u266a"],
  ["\u00e2\u20ac", "\u201d"],
  ["\ufffd", ""]
];

function hasPotentialMojibake(text) {
  for (let index = 0; index < text.length; index++) {
    const ch = text[index];
    if (ch === "\u00e2" || ch === "\u00c2" || ch === "\ufffd") {
      return true;
    }
  }
  return false;
}

export function sanitizeSubtitleMojibake(text) {
  if (typeof text !== "string" || !hasPotentialMojibake(text)) {
    return text;
  }
  let sanitized = text;
  for (const [pattern, replacement] of REPLACEMENTS) {
    if (sanitized.includes(pattern)) {
      sanitized = sanitized.split(pattern).join(replacement);
    }
  }
  return sanitized;
}
