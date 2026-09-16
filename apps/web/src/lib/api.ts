/**
 * Base URL for backend calls from the browser.
 * The browser talks only to the same-origin proxy (/api/proxy/...), which adds the
 * server-side ADMIN_TOKEN and forwards to the backend. The token never reaches the client.
 */
export const API_BASE = '/api/proxy'
