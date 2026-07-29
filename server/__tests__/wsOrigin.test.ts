/**
 * WebSocket origin gate.
 *
 * Standalone `/ws` has no Bearer check. The reasoning was "loopback bind, so only
 * local clients" — but a browser page can open a WebSocket to localhost, and
 * WebSockets skip the CORS preflight. Without an Origin check, any site the user
 * visits can drive this server.
 *
 * Harmless while the UI only read state. Not harmless once it can act on agents.
 */
import { describe, expect, it } from 'vitest';

import { isAllowedOrigin } from '../src/httpServer.js';

describe('isAllowedOrigin', () => {
  it('allows the SPA served by this server', () => {
    expect(isAllowedOrigin('http://127.0.0.1:3100')).toBe(true);
    expect(isAllowedOrigin('http://localhost:3100')).toBe(true);
  });

  it('allows other loopback ports — the Vite dev server is one', () => {
    expect(isAllowedOrigin('http://localhost:5173')).toBe(true);
    expect(isAllowedOrigin('http://127.0.0.1:8080')).toBe(true);
  });

  it('allows IPv6 loopback', () => {
    expect(isAllowedOrigin('http://[::1]:3100')).toBe(true);
  });

  it('rejects remote sites — this is the case the gate exists for', () => {
    expect(isAllowedOrigin('https://evil.example')).toBe(false);
    expect(isAllowedOrigin('http://attacker.test:3100')).toBe(false);
  });

  it('rejects hostnames that merely contain a loopback name', () => {
    expect(isAllowedOrigin('http://localhost.evil.example')).toBe(false);
    expect(isAllowedOrigin('http://127.0.0.1.evil.example')).toBe(false);
    expect(isAllowedOrigin('http://notlocalhost')).toBe(false);
  });

  it('rejects a malformed Origin rather than guessing', () => {
    expect(isAllowedOrigin('not a url')).toBe(false);
  });

  it('allows a missing Origin — native clients send none', () => {
    // curl, the bridge, test scripts. A process running as this user can already
    // read the token from disk or run the CLI directly, so this is not new reach.
    expect(isAllowedOrigin(undefined)).toBe(true);
    expect(isAllowedOrigin('')).toBe(true);
  });
});
