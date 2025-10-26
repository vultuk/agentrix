import { sendJson } from '../utils/http.js';

export function createAuthHandlers(authManager) {
  async function login(context) {
    const payload = await context.readJsonBody();
    const password =
      typeof payload.password === 'string' ? payload.password.trim() : '';

    try {
      authManager.login(context.req, context.res, password);
      sendJson(context.res, 200, { authenticated: true });
    } catch (error) {
      const statusCode = error.statusCode || (error.message === 'Invalid password' ? 401 : 400);
      sendJson(context.res, statusCode, { error: error.message });
    }
  }

  async function logout(context) {
    authManager.logout(context.req, context.res);
    sendJson(context.res, 200, { authenticated: false });
  }

  function status(context) {
    const authenticated = authManager.isAuthenticated(context.req);
    sendJson(context.res, 200, { authenticated });
  }

  return {
    login,
    logout,
    status,
  };
}
