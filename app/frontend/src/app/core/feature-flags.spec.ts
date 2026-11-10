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
    ).toEqual({
      authCoreV2: true, authCoreV2Adapter: 'http', authCoreV2HttpTopologyVerified: true,
      catalogInternalJwt: false, passwordAuth: false,
    });
  });

  it('enables the internal-JWT catalog only with an explicit boolean', () => {
    expect(resolveFeatureFlags({ catalogInternalJwt: true }).catalogInternalJwt).toBe(true);
    expect(resolveFeatureFlags({ catalogInternalJwt: 'true' }).catalogInternalJwt).toBe(false);
  });

  it('enables password sign-in only with an explicit boolean, off by default', () => {
    expect(DEFAULT_FEATURE_FLAGS.passwordAuth).toBe(false);
    expect(resolveFeatureFlags({ passwordAuth: true }).passwordAuth).toBe(true);
    expect(resolveFeatureFlags({ passwordAuth: 'true' }).passwordAuth).toBe(false);
    expect(resolveFeatureFlags({ passwordAuth: 1 }).passwordAuth).toBe(false);
  });

  it('ignores values of the wrong type', () => {
    expect(
      resolveFeatureFlags({ authCoreV2: 'true', authCoreV2Adapter: 'grpc', authCoreV2HttpTopologyVerified: 1, catalogInternalJwt: 1, passwordAuth: 'yes' }),
    ).toEqual(DEFAULT_FEATURE_FLAGS);
  });
});
