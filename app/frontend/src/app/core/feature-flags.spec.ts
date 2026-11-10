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
    ).toEqual({ authCoreV2: true, authCoreV2Adapter: 'http', authCoreV2HttpTopologyVerified: true, catalogInternalJwt: false });
  });

  it('enables the internal-JWT catalog only with an explicit boolean', () => {
    expect(resolveFeatureFlags({ catalogInternalJwt: true }).catalogInternalJwt).toBe(true);
    expect(resolveFeatureFlags({ catalogInternalJwt: 'true' }).catalogInternalJwt).toBe(false);
  });

  it('ignores values of the wrong type', () => {
    expect(
      resolveFeatureFlags({ authCoreV2: 'true', authCoreV2Adapter: 'grpc', authCoreV2HttpTopologyVerified: 1, catalogInternalJwt: 1 }),
    ).toEqual(DEFAULT_FEATURE_FLAGS);
  });
});
