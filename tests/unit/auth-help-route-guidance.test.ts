import { describe, expect, it } from 'bun:test';
import * as fs from 'fs';
import * as path from 'path';

describe('auth help account route guidance', () => {
  it('keeps the help copy explicit about account choice and credential isolation', () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), 'src', 'auth', 'auth-commands.ts'),
      'utf8'
    );

    expect(source).toContain('Create two isolated accounts and choose one explicitly at runtime');
    expect(source).toContain('ccs auth create work');
    expect(source).toContain('ccs auth create personal');
    expect(source).toContain('Account logins, tokens, and .anthropic stay isolated');
    expect(source).toContain('settings.json');
    expect(source).toContain('ccs auth show <profile>');
    expect(source).toContain('History sync is opt-in');
    expect(source).toContain('ccs auth backup default');
  });
});
