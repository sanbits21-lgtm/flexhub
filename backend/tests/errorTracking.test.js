const tracking = require('../utils/errorTracking');

// Sentry is optional and must never be able to leak what this app holds (phone numbers, health notes) or break a request.
describe('error tracking', () => {
  it('does nothing without a DSN', () => {
    delete process.env.SENTRY_DSN;
    expect(tracking.init()).toBe(false);
    expect(tracking.enabled()).toBe(false);
    expect(tracking.capture(new Error('x'), 'GET /api/x')).toBe(false);
  });

  it('removes everything about the visitor from an event', () => {
    const event = tracking.scrub({
      message: 'boom',
      request: { method: 'POST', url: 'https://fitzyclub.in/api/members?phone=9876543210', data: { phone: '9876543210', healthNotes: 'asthma' }, headers: { authorization: 'Bearer abc' }, cookies: { refresh: 'xyz' }, query_string: 'phone=9876543210' },
      user: { id: '1', email: 'a@b.com', ip_address: '1.2.3.4' },
      server_name: 'laptop',
      contexts: { device: { name: 'x' }, runtime: { name: 'node' } },
      breadcrumbs: [{ category: 'http', level: 'info', timestamp: 1, message: 'GET /api/members/9876543210', data: { url: '/api?token=zzz' } }],
      extra: { body: 'secret' },
    });
    const text = JSON.stringify(event);
    for (const secret of ['9876543210', 'asthma', 'Bearer', 'xyz', 'a@b.com', '1.2.3.4', 'laptop', 'token=zzz', 'secret']) expect(text).not.toContain(secret);
    expect(event.request).toEqual({ method: 'POST', url: 'https://fitzyclub.in/api/members' });
    expect(event.message).toBe('boom'); // the error itself is kept
    expect(event.contexts.runtime).toBeTruthy();
  });

  it('a broken or missing DSN cannot stop the server starting', () => {
    process.env.SENTRY_DSN = 'not a dsn';
    expect(() => tracking.init()).not.toThrow();
    delete process.env.SENTRY_DSN;
  });
});

describe('the page may report errors only to the tracker', () => {
  const { errorReportOrigins } = require('../middleware/csp');
  it('allows the host in the DSN, and nothing when there is none or it is not https', () => {
    expect(errorReportOrigins('https://abc123@o12345.ingest.sentry.io/678')).toEqual(['https://o12345.ingest.sentry.io']);
    expect(errorReportOrigins('')).toEqual([]);
    expect(errorReportOrigins('not a url')).toEqual([]);
    expect(errorReportOrigins('http://abc@insecure.example.com/1')).toEqual([]);
  });
});
