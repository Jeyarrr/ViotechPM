import type { Prisma } from '../generated/prisma/client.js';
import type { PublicUser } from './auth.service.js';
import { milestoneListSchema } from '../validators/milestone.js';
import { transactionListSchema } from '../validators/transaction.js';
import { expenseListSchema } from '../validators/expense.js';
import { milestoneWhere } from '../routes/milestone.routes.js';
import { transactionWhere } from './transaction.service.js';
import { expenseWhere } from './expense.service.js';
import { pageResult } from './core.service.js';
import { AppError } from '../utils/errors.js';

export const reportKinds = ['milestones', 'transactions', 'expenses'] as const;
export type ReportKind = (typeof reportKinds)[number];
export type ReportRow = Record<string, string> & { id: string };
export const reportColumns: Record<ReportKind, string[]> = {
  milestones: [
    'Project code',
    'Project',
    'Milestone',
    'Responsible employee',
    'Due date',
    'Status',
    'Completed at',
  ],
  transactions: [
    'Reference',
    'Project',
    'Transaction type',
    'Title',
    'Amount (PHP)',
    'Requester',
    'Date',
    'Approval status',
  ],
  expenses: [
    'Project',
    'Expense category',
    'Description',
    'Amount (PHP)',
    'Date',
    'Recorded by',
    'Entry type',
    'Transaction reference',
    'Reversal of',
    'Reversal reason',
  ],
};
// Quote every cell and neutralize formulas, including formulas hidden behind whitespace.
export function csvCell(value: string) {
  // eslint-disable-next-line no-control-regex -- Control-prefixed spreadsheet formulas must also be neutralized.
  const safe = /^[\s\u0000-\u001f]*[=+\-@]|^[\t\r\n]/u.test(value) ? `'${value}` : value;
  return `"${safe.replaceAll('"', '""')}"`;
}
export function reportCsv(kind: ReportKind, rows: ReportRow[]) {
  const columns = reportColumns[kind];
  return (
    '\uFEFF' +
    [columns, ...rows.map((row) => columns.map((column) => row[column] ?? ''))]
      .map((row) => row.map(csvCell).join(','))
      .join('\r\n') +
    '\r\n'
  );
}
const MAX_EXPORT = 10000;
export async function reportData(
  tx: Prisma.TransactionClient,
  kind: ReportKind,
  input: unknown,
  user: PublicUser,
  exporting = false,
) {
  let rows: ReportRow[], total: number;
  const q =
    kind === 'milestones'
      ? milestoneListSchema.parse(input)
      : kind === 'transactions'
        ? transactionListSchema.parse(input)
        : expenseListSchema.parse(input);
  const paging = {
    skip: exporting ? 0 : (q.page - 1) * q.pageSize,
    take: exporting ? MAX_EXPORT + 1 : q.pageSize,
  };
  if (kind === 'milestones') {
    const query = milestoneListSchema.parse(input),
      where = milestoneWhere(query, user);
    total = await tx.milestone.count({ where });
    const items = await tx.milestone.findMany({
      where,
      ...paging,
      include: {
        project: { select: { code: true, name: true } },
        responsible: { select: { name: true } },
      },
      orderBy: [{ [query.sort]: query.direction }, { id: 'asc' }],
    });
    rows = items.map((m) => ({
      id: m.id,
      'Project code': m.project.code,
      Project: m.project.name,
      Milestone: m.title,
      'Responsible employee': m.responsible?.name ?? 'Unassigned',
      'Due date': m.dueDate.toISOString().slice(0, 10),
      Status: m.status,
      'Completed at': m.completedAt?.toISOString() ?? '',
    }));
  } else if (kind === 'transactions') {
    const query = transactionListSchema.parse(input),
      where = transactionWhere(query, user);
    total = await tx.projectTransaction.count({ where });
    const items = await tx.projectTransaction.findMany({
      where,
      ...paging,
      include: {
        project: { select: { name: true } },
        type: { select: { name: true } },
        requester: { select: { name: true } },
      },
      orderBy: [{ [query.sort]: query.direction }, { id: 'asc' }],
    });
    rows = items.map((t) => ({
      id: t.id,
      Reference: t.reference,
      Project: t.project.name,
      'Transaction type': t.type.name,
      Title: t.title,
      'Amount (PHP)': t.requestedAmount.toFixed(2),
      Requester: t.requester.name,
      Date: t.transactionDate.toISOString().slice(0, 10),
      'Approval status': t.status,
    }));
  } else {
    const query = expenseListSchema.parse(input),
      where = expenseWhere(query, user);
    total = await tx.expense.count({ where });
    const items = await tx.expense.findMany({
      where,
      ...paging,
      include: {
        project: { select: { name: true } },
        recordedBy: { select: { name: true } },
        transaction: { select: { reference: true } },
        reversalOf: { select: { transaction: { select: { reference: true } } } },
      },
      orderBy: [{ [query.sort]: query.direction }, { id: 'asc' }],
    });
    rows = items.map((e) => ({
      id: e.id,
      Project: e.project.name,
      'Expense category': e.category,
      Description: e.description,
      'Amount (PHP)': e.amount.toFixed(2),
      Date: e.expenseDate.toISOString().slice(0, 10),
      'Recorded by': e.recordedBy.name,
      'Entry type': e.kind,
      'Transaction reference':
        e.transaction?.reference ?? e.reversalOf?.transaction?.reference ?? '',
      'Reversal of': e.reversalOfId ?? '',
      'Reversal reason': e.reversalReason ?? '',
    }));
  }
  if (exporting && total > MAX_EXPORT)
    throw new AppError(
      422,
      'EXPORT_TOO_LARGE',
      `This export exceeds ${MAX_EXPORT} rows. Narrow the filters and try again.`,
    );
  return { ...pageResult(rows, total, q.page, q.pageSize), columns: reportColumns[kind] };
}
