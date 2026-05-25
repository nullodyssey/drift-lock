import { describe, expect, it } from 'vitest';
import { scanDisableDirectives } from '../src/core/disable-directives.js';
import { createProject } from './helpers/core-test-utils.js';

describe('drift disable directives', () => {
  it('reports malformed expired directives sorted by file and line', async () => {
    const root = await createProject({
      'src/a.ts': [
        '// drift-lock-disable-file drift/import-boundary -- reason: migration window, expires: 2999-01-01',
        'export const a = true;',
        '// drift-lock-disable-next-line drift/ssot-flow',
      ].join('\n'),
      'src/b.ts': [
        '// drift-lock-disable-next-line -- reason: missing rule is malformed',
        '// drift-lock-disable-file drift/import-boundary -- reason: legacy adapter, expires: 2000-01-01',
        '// drift-lock-disable-next-line drift/ssot-flow -- reason: invalid date, expires: 2026-02-30',
      ].join('\n'),
    });

    const result = await scanDisableDirectives(root, ['src/b.ts', 'src/a.ts']);

    expect(result).toMatchObject({
      total: 5,
      malformed: 3,
      expired: 1,
    });
    expect(result.items).toEqual([
      {
        file: 'src/a.ts',
        line: 1,
        kind: 'file',
        rule: 'drift/import-boundary',
        reason: 'migration window',
        expires: '2999-01-01',
        expired: false,
        malformed: false,
        message: undefined,
      },
      {
        file: 'src/a.ts',
        line: 3,
        kind: 'next-line',
        rule: 'drift/ssot-flow',
        reason: undefined,
        expires: undefined,
        expired: false,
        malformed: true,
        message: 'missing reason',
      },
      {
        file: 'src/b.ts',
        line: 1,
        kind: 'next-line',
        rule: undefined,
        reason: 'missing rule is malformed',
        expires: undefined,
        expired: false,
        malformed: true,
        message: 'missing rule',
      },
      {
        file: 'src/b.ts',
        line: 2,
        kind: 'file',
        rule: 'drift/import-boundary',
        reason: 'legacy adapter',
        expires: '2000-01-01',
        expired: true,
        malformed: false,
        message: undefined,
      },
      {
        file: 'src/b.ts',
        line: 3,
        kind: 'next-line',
        rule: 'drift/ssot-flow',
        reason: 'invalid date',
        expires: '2026-02-30',
        expired: false,
        malformed: true,
        message: 'invalid expires',
      },
    ]);
  });
});
