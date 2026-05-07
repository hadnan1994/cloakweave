export type PrivacySummary = {
  localFirst: true;
  telemetryEnabledByDefault: false;
  cloudProvidersOptIn: true;
  defaultProviderMode: 'local';
};

export const privacySummary: PrivacySummary = {
  localFirst: true,
  telemetryEnabledByDefault: false,
  cloudProvidersOptIn: true,
  defaultProviderMode: 'local'
};

export function canSendDocumentContentToCloud(explicitlyEnabled: boolean): boolean {
  return explicitlyEnabled;
}
