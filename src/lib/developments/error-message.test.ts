import { describe, expect, it } from 'vitest';
import { errorMessage } from './error-message';
describe('errorMessage', () => {
  it('Error', () => expect(errorMessage(new Error('boom'), 'f')).toBe('boom'));
  it('42501', () => expect(errorMessage({ code: '42501', message: 'new row violates row-level security policy' }, 'f')).toBe('Nu ai drepturi să salvezi acest ansamblu.'));
  it('23514', () => expect(errorMessage({ code: '23514', message: 'check' }, 'f')).toBe('Unele valori nu sunt valide (verifică suprafețele și prețurile).'));
  it('trigger', () => expect(errorMessage({ code: 'P0001', message: 'Agentul nu aparține agenției' }, 'f')).toBe('Agentul nu aparține agenției'));
  it('fallback', () => { expect(errorMessage(null, 'f')).toBe('f'); expect(errorMessage({}, 'f')).toBe('f'); });
});
