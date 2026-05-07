import { describe, expect, it } from 'vitest';
import { canSendDocumentContentToCloud, privacySummary } from '@/lib/privacy';

describe('privacy', () => {
  it('defaults to local-first behavior without telemetry', () => {
    expect(privacySummary).toEqual({
      localFirst: true,
      telemetryEnabledByDefault: false,
      cloudProvidersOptIn: true,
      defaultProviderMode: 'local'
    });
  });

  it('requires explicit opt-in before cloud document content is allowed', () => {
    expect(canSendDocumentContentToCloud(false)).toBe(false);
    expect(canSendDocumentContentToCloud(true)).toBe(true);
  });

  it('keeps telemetry disabled and cloud providers opt-in in the public contract', () => {
    expect(privacySummary.telemetryEnabledByDefault).toBe(false);
    expect(privacySummary.cloudProvidersOptIn).toBe(true);
    expect(privacySummary.defaultProviderMode).toBe('local');
  });
});
