import { determineSecureCookie } from '../utils/http.js';

export function createCookieManager({ secureSetting }) {
  const normalized = typeof secureSetting === 'string' ? secureSetting.trim().toLowerCase() : secureSetting;
  return {
    resolveSecure(req) {
      return determineSecureCookie({ configValue: normalized, request: req });
    },
  };
}
