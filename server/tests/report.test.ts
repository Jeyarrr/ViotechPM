import { describe, it, expect, vi } from 'vitest';
import { csvCell, reportCsv, reportData } from '../src/services/report.service.js';
import { redactAuditMetadata } from '../src/services/core.service.js';
import type { Prisma } from '../src/generated/prisma/client.js';
import type { PublicUser } from '../src/services/auth.service.js';
describe('Operational export safety', () => {
  it.each([
    '=SUM(1,2)',
    '+cmd',
    '-60.10',
    '@SUM(A1)',
    '  =HYPERLINK("x")',
    '\t=1',
    '\r@formula',
    '\n+formula',
  ])('neutralizes spreadsheet input %j', (value) => {
    expect(csvCell(value)).toBe(`"'${value.replaceAll('"', '""')}"`);
  });
  it('quotes delimiters, quotes and multiline cells without changing ordinary text', () => {
    expect(csvCell('Reference, "quoted"\nsecond line')).toBe(
      '"Reference, ""quoted""\nsecond line"',
    );
    expect(csvCell('100.25')).toBe('"100.25"');
    expect(
      reportCsv('transactions', [
        { id: 'hidden', Reference: 'TX-01', Title: '=1+1', 'Amount (PHP)': '10.25' },
      ]),
    ).toContain('"TX-01","","","\'=1+1","10.25"');
    expect(reportCsv('transactions', [])).not.toContain('hidden');
  });
  it('refuses an oversized export rather than silently truncating', async () => {
    const tx = {
      milestone: {
        count: vi.fn().mockResolvedValue(10001),
        findMany: vi.fn().mockResolvedValue([]),
      },
    };
    await expect(
      reportData(
        tx as unknown as Prisma.TransactionClient,
        'milestones',
        {},
        { role: { key: 'super_admin' } } as PublicUser,
        true,
      ),
    ).rejects.toMatchObject({ status: 422, code: 'EXPORT_TOO_LARGE' });
  });
  it('redacts credential fields recursively while preserving relevant changes', () => {
    expect(
      redactAuditMetadata({
        amount: { before: '0.10', after: '0.20' },
        password: 'hidden',
        nested: [{ sessionSecret: 'hidden', csrfToken: 'hidden', authorization: 'hidden' }],
      }),
    ).toEqual({
      amount: { before: '0.10', after: '0.20' },
      password: '[REDACTED]',
      nested: [
        { sessionSecret: '[REDACTED]', csrfToken: '[REDACTED]', authorization: '[REDACTED]' },
      ],
    });
  });
});
