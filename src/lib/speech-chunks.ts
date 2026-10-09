/**
 * Splits a long translation into parts that are synthesized and played one after another:
 * /api/speak takes at most MAX_SPEAK_CHARS, and short parts start playing sooner.
 */

/** About a minute of speech, well within the player's two-minute watchdog. */
export const SPEECH_CHUNK_CHARS = 1_000;

const SENTENCE_END = /[.!?…。！？]/;
/** Closing punctuation that stays with the sentence before it. */
const TRAILING = /[.!?…。！？"'”’»)\]]/;
/** CJK sentence ends need no space after them. */
const CJK_END = /[。！？]/;

/** Sentences with their trailing punctuation and whitespace; joined, they give back `text`. */
function sentences(text: string): string[] {
  const out: string[] = [];
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    if (!SENTENCE_END.test(text[i])) continue;
    let end = i + 1;
    while (end < text.length && TRAILING.test(text[end])) end++;
    // "3.5" or "e.g." inside a sentence is not followed by a space.
    if (end < text.length && !/\s/.test(text[end]) && !CJK_END.test(text[i])) continue;
    while (end < text.length && /\s/.test(text[end])) end++;
    out.push(text.slice(start, end));
    start = end;
    i = end - 1;
  }
  if (start < text.length) out.push(text.slice(start));
  return out;
}

/** Cuts a sentence that is longer than `max` at a clause or word break (hard, if it has none). */
function breakLong(sentence: string, max: number): string[] {
  const parts: string[] = [];
  let rest = sentence;
  while (rest.length > max) {
    const window = rest.slice(0, max);
    let cut = Math.max(
      window.lastIndexOf(', '),
      window.lastIndexOf('; '),
      window.lastIndexOf('，'),
      window.lastIndexOf('、')
    );
    if (cut < max / 2) cut = window.lastIndexOf(' ');
    if (cut < max / 2) cut = max - 1;
    parts.push(rest.slice(0, cut + 1));
    rest = rest.slice(cut + 1);
  }
  parts.push(rest);
  return parts;
}

/** Packs whole sentences into parts of at most `max` characters. */
export function splitForSpeech(text: string, max: number = SPEECH_CHUNK_CHARS): string[] {
  const clean = text.trim();
  if (clean.length <= max) return clean ? [clean] : [];
  const chunks: string[] = [];
  let current = '';
  for (const piece of sentences(clean).flatMap((sentence) => breakLong(sentence, max))) {
    if ((current + piece).trim().length > max && current.trim()) {
      chunks.push(current.trim());
      current = '';
    }
    current += piece;
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks;
}
