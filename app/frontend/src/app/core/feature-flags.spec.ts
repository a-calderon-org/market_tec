import { DEFAULT_FEATURE_FLAGS, resolveFeatureFlags } from './feature-flags';

describe('resolveFeatureFlags', () => {
  it('keeps the defaults when the build declares no flags', () => {
    expect(resolveFeatureFlags(undefined)).toEqual(DEFAULT_FEATURE_FLAGS);
    expect(resolveFeatureFlags(null)).toEqual(DEFAULT_FEATURE_FLAGS);
    expect(resolveFeatureFlags('authCoreV2')).toEqual(DEFAULT_FEATURE_FLAGS);
  });

  it('applies the staging HTTP configuration', () => {
    expect(
      resolveFeatureFlags({ authCoreV2: true, authCoreV2Adapter: 'http', authCoreV2HttpTopologyVerified: true }),
    ).toEqual({ authCoreV2: true, authCoreV2Adapter: 'http', authCoreV2HttpTopologyVerified: true });
  });

  it('ignores values of the wrong type', () => {
    expect(
      resolveFeatureFlags({ authCoreV2: 'true', authCoreV2Adapter: 'grpc', authCoreV2HttpTopologyVerified: 1 }),
    ).toEqual(DEFAULT_FEATURE_FLAGS);
  });
});
