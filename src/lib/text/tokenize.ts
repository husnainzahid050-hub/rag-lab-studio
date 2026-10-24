const STOPWORDS = new Set(
  (
    "a an and are as at be been but by can could did do does for from had has have how i if in into is it its " +
    "me my of on or our should so than that the their them then there these they this those to was we were " +
    "what when where which who whom why will with would you your about after all also any before being both " +
    "each few more most other some such only own same too very just over under again further once here there's " +
    "am he she his her hers him not no nor up down out off s t don"
  ).split(" "),
);

/**
 * Words that shape a question ("how long", "how many", "does it take") but rarely
 * appear in the passage that answers it, so they would only add noise to matching.
 */
const QUESTION_FILLERS = new Set(
  "long much many often far take takes taking get gets got make makes need needs tell know please kind".split(" "),
);

export function isStopword(word: string): boolean {
  return STOPWORDS.has(word) || QUESTION_FILLERS.has(word);
}

/**
 * A deliberately small suffix stripper so that "roasted", "roasting" and "roasts"
 * share the term "roast". It is not a full Porter stemmer; it only needs to be
 * consistent between documents and queries.
 */
export function stem(word: string): string {
  if (word.length <= 3 || /^\d+$/.test(word)) return word;
  let w = word;
  if (w.endsWith("ies") && w.length > 4) return w.slice(0, -3) + "y";
  if (w.endsWith("ing") && w.length > 5) w = w.slice(0, -3);
  else if (w.endsWith("ed") && w.length > 4) w = w.slice(0, -2);
  else if (w.endsWith("es") && /(ss|x|ch|sh)es$/.test(w)) w = w.slice(0, -2);
  else if (w.endsWith("s") && !w.endsWith("ss") && !w.endsWith("us") && w.length > 3) w = w.slice(0, -1);
  else if (w.endsWith("ly") && w.length > 4) w = w.slice(0, -2);
  // "shipping" -> "shipp" -> "ship"
  if (/([^aeiouls])\1$/.test(w)) w = w.slice(0, -1);
  return w;
}

/** Lowercases, splits on anything that is not a letter or digit, drops stopwords and stems. */
export function tokenize(text: string): string[] {
  const words = text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
  const terms: string[] = [];
  for (const word of words) {
    if (word.length < 2 && !/\d/.test(word)) continue;
    if (isStopword(word)) continue;
    terms.push(stem(word));
  }
  return terms;
}

export function uniqueTerms(text: string): string[] {
  return [...new Set(tokenize(text))];
}

/** Lowercase and collapse whitespace so phrase matching ignores line breaks and case. */
export function normalizeForMatch(text: string): string {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}
