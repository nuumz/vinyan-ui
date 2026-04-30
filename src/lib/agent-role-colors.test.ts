import { describe, expect, test } from 'bun:test';
import { roleColor } from './agent-role-colors';

describe('roleColor', () => {
  test('returns neutral tokens for any role (monochrome aesthetic)', () => {
    expect(roleColor(undefined).key).toBe('neutral');
    expect(roleColor('').key).toBe('neutral');
    expect(roleColor('researcher').key).toBe('neutral');
    expect(roleColor('mentor').key).toBe('neutral');
    expect(roleColor('author').key).toBe('neutral');
    expect(roleColor('  Verifier  ').key).toBe('neutral');
    expect(roleColor('cartographer').key).toBe('neutral');
  });

  test('returned tokens are non-empty Tailwind classes', () => {
    const t = roleColor('researcher');
    expect(t.bar.length).toBeGreaterThan(0);
    expect(t.border.length).toBeGreaterThan(0);
    expect(t.label.length).toBeGreaterThan(0);
  });
});
