import { expect, it } from 'vitest';
import { isOperationalAgency } from './superadmin-status';
const now = Date.parse('2026-11-27T04:49:00Z');
const day = 86400000;
it.each(['active', 'trial'])('%s cu termen viitor este operațională', status => {
  expect(isOperationalAgency({ status, subscription_expires_at: new Date(now + day).toISOString() }, now)).toBe(true);
});
it('fără termen rămâne operațională', () => {
  expect(isOperationalAgency({ status: 'active', subscription_expires_at: null }, now)).toBe(true);
});
it.each(['active', 'trial'])('%s rămâne în grație până la limita de 5 zile', status => {
  const org = { status, subscription_expires_at: new Date(now - 5 * day + 1).toISOString() };
  expect(isOperationalAgency(org, now)).toBe(true);
  expect(isOperationalAgency(org, now + 1)).toBe(false);
});
it.each(['suspended', 'cancelled', 'pending_approval', 'archived', 'expired'])('%s nu este operațională', status => {
  expect(isOperationalAgency({ status }, now)).toBe(false);
});
it('arhivarea exclude și o agenție activă', () => {
  expect(isOperationalAgency({ status: 'active', archived_at: '2026-11-26' }, now)).toBe(false);
});
