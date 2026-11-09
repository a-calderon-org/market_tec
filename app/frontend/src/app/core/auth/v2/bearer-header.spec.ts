import { bearerHeaderName, SAME_ORIGIN_PROXY_AUTHORIZATION_HEADER } from './auth-v2-config';

describe('bearerHeaderName', () => {
  const swa = 'https://victorious-beach-0a55f0c1e.2.azurestaticapps.net';

  it('uses X-MTEC-Authorization towards the Static Web Apps same-origin proxy', () => {
    expect(bearerHeaderName(`${swa}/api/users`, swa)).toBe(SAME_ORIGIN_PROXY_AUTHORIZATION_HEADER);
    expect(bearerHeaderName(`${swa}/api`, swa)).toBe(SAME_ORIGIN_PROXY_AUTHORIZATION_HEADER);
  });

  it('keeps Authorization for any other API base or origin', () => {
    expect(bearerHeaderName(`${swa}/api/users`, 'https://other.example')).toBe('Authorization');
    expect(bearerHeaderName('https://markettec-api.azure-api.net/users', swa)).toBe('Authorization');
    expect(bearerHeaderName(`${swa}/apis/users`, swa)).toBe('Authorization');
    expect(bearerHeaderName('', swa)).toBe('Authorization');
    expect(bearerHeaderName(undefined, swa)).toBe('Authorization');
  });
});
