import { canRetry, type Message } from '../conversation';

const message = (patch: Partial<Message>): Message => ({
  id: 'm1',
  speaker: 'me',
  source: 'en-US',
  target: 'de-DE',
  original: 'Hello',
  status: 'error',
  input: 'text',
  createdAt: 0,
  ...patch,
});

describe('canRetry', () => {
  it('retries failures that may pass next time', () => {
    expect(canRetry(message({ errorCode: 'network' }))).toBe(true);
    expect(canRetry(message({ errorCode: 'upstream_auth' }))).toBe(true);
    expect(canRetry(message({}))).toBe(true);
  });

  it('does not retry what would fail again', () => {
    expect(canRetry(message({ errorCode: 'text_too_long' }))).toBe(false);
    expect(canRetry(message({ errorCode: 'unsupported_language' }))).toBe(false);
  });

  it('only applies to failed messages', () => {
    expect(canRetry(message({ status: 'done', translation: 'Hallo' }))).toBe(false);
    expect(canRetry(message({ status: 'translating' }))).toBe(false);
  });
});
