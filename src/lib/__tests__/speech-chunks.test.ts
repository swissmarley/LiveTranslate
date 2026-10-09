import { MAX_SPEAK_CHARS } from '../api-types';
import { SPEECH_CHUNK_CHARS, splitForSpeech } from '../speech-chunks';

const squash = (text: string) => text.replace(/\s+/g, '');

describe('splitForSpeech', () => {
  it('keeps short text in one part', () => {
    expect(splitForSpeech('  Hello there.  ')).toEqual(['Hello there.']);
    expect(splitForSpeech('   ')).toEqual([]);
  });

  it('packs whole sentences into parts', () => {
    expect(splitForSpeech('One two. Three four! Five six? Seven.', 20)).toEqual([
      'One two. Three four!',
      'Five six? Seven.',
    ]);
  });

  it('does not split inside numbers or abbreviations', () => {
    expect(splitForSpeech('It costs 3.50 francs, e.g.cash. Thanks a lot.', 32)).toEqual([
      'It costs 3.50 francs, e.g.cash.',
      'Thanks a lot.',
    ]);
  });

  it('splits CJK sentences without spaces', () => {
    expect(splitForSpeech('今日は晴れです。明日は雨です。', 8)).toEqual(['今日は晴れです。', '明日は雨です。']);
  });

  it('breaks an overlong sentence at a clause, a word, or hard', () => {
    expect(splitForSpeech('aaaa bbbb, cccc dddd eeee', 12)).toEqual(['aaaa bbbb,', 'cccc dddd', 'eeee']);
    expect(splitForSpeech('x'.repeat(25), 10)).toEqual(['x'.repeat(10), 'x'.repeat(10), 'x'.repeat(5)]);
  });

  it('keeps every part within the server limit and loses no text', () => {
    const sentence = 'Der Zug nach Zürich fährt um 14.32 Uhr von Gleis 7 ab, bitte einsteigen. ';
    const text = sentence.repeat(70);
    const parts = splitForSpeech(text);
    expect(parts.length).toBeGreaterThan(1);
    for (const part of parts) expect(part.length).toBeLessThanOrEqual(SPEECH_CHUNK_CHARS);
    expect(SPEECH_CHUNK_CHARS).toBeLessThanOrEqual(MAX_SPEAK_CHARS);
    expect(squash(parts.join(' '))).toBe(squash(text));
  });
});
