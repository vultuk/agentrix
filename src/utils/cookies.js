export function parseCookies(header) {
  if (typeof header !== 'string' || !header.trim()) {
    return {};
  }

  return header.split(';').reduce((acc, part) => {
    const [name, ...rest] = part.split('=');
    if (!name) {
      return acc;
    }
    const key = name.trim();
    if (!key) {
      return acc;
    }
    const value = rest.join('=').trim();
    acc[key] = value;
    return acc;
  }, {});
}

export function serializeCookie(name, value, options = {}) {
  const parts = [`${name}=${value}`];

  if (options.maxAge != null) {
    parts.push(`Max-Age=${options.maxAge}`);
  }

  if (options.expires instanceof Date) {
    parts.push(`Expires=${options.expires.toUTCString()}`);
  }

  const path = options.path || '/';
  if (path) {
    parts.push(`Path=${path}`);
  }

  const sameSite = options.sameSite || 'Strict';
  if (sameSite) {
    parts.push(`SameSite=${sameSite}`);
  }

  if (options.httpOnly !== false) {
    parts.push('HttpOnly');
  }

  if (options.secure) {
    parts.push('Secure');
  }

  return parts.join('; ');
}

export function setCookie(res, name, value, options = {}) {
  const header = serializeCookie(name, value, options);
  const existing = res.getHeader('Set-Cookie');
  if (Array.isArray(existing)) {
    res.setHeader('Set-Cookie', [...existing, header]);
  } else if (existing) {
    res.setHeader('Set-Cookie', [existing, header]);
  } else {
    res.setHeader('Set-Cookie', header);
  }
}

export function clearCookie(res, name, options = {}) {
  const expires = new Date(0);
  setCookie(res, name, '', { ...options, maxAge: 0, expires });
}
