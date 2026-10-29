import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import { useCoreMutation } from '@/hooks/use-core';
import { api } from '@/services/api';
import { currency } from '@/lib/utils';
import { businessDate } from '@/lib/operations';
import { RecordDialog, RecordForm } from './crud';
import { ErrorState } from './feedback';
import type { PageResult } from '@/types/core';
import type { PostableTransaction, ExpenseRecord } from '@/types/finance';

export function PostExpenseDialog({
  transaction,
  onClose,
  onSaved,
}: {
  transaction?: { id: string; reference: string; requestedAmount: string };
  onClose: () => void;
  onSaved: () => void;
}) {
  const options = useQuery({
    queryKey: ['core', 'postable-transactions'],
    enabled: !transaction,
    queryFn: async () => {
      const items: PostableTransaction[] = [];
      let page = 1,
        pages = 1;
      do {
        const result = await api.get<PageResult<PostableTransaction>>(
          `/expenses/postable?page=${page}&pageSize=100`,
        );
        items.push(...result.items);
        pages = result.pages;
        page++;
      } while (page <= pages);
      return items;
    },
  });
  const save = useCoreMutation((v: Record<string, string>) =>
    api.post('/expenses', { ...v, ...(transaction ? { transactionId: transaction.id } : {}) }),
  );
  if (!transaction && !options.data)
    return (
      <RecordDialog
        title="Post approved expense"
        description="Loading approved requests awaiting posting."
        onClose={onClose}
      >
        {options.isError ? (
          <ErrorState message={options.error.message} retry={() => void options.refetch()} />
        ) : (
          <p role="status">Loading…</p>
        )}
      </RecordDialog>
    );
  if (!transaction && !options.data?.length)
    return (
      <RecordDialog
        title="Post approved expense"
        description="No authorized approved requests are awaiting posting."
        onClose={onClose}
      >
        <p className="field-hint">
          Create a transaction and complete its review stages before posting an expense.
        </p>
        <Link className="record-link" to="/transactions">
          View transactions
        </Link>
      </RecordDialog>
    );
  return (
    <RecordForm
      title={
        transaction
          ? `Post ${transaction.reference} · ${currency(transaction.requestedAmount)}`
          : 'Post approved expense'
      }
      fields={[
        ...(!transaction
          ? [
              {
                name: 'transactionId',
                label: 'Approved request',
                type: 'select' as const,
                required: true,
                options:
                  options.data?.map((t) => ({
                    value: t.id,
                    label: `${t.reference} · ${t.project.name} · ${currency(t.requestedAmount)}`,
                  })) ?? [],
              },
            ]
          : []),
        {
          name: 'expenseDate',
          label: 'Expense date',
          type: 'date',
          required: true,
          hint: 'The approved amount is posted once. Posting cannot exceed the project’s authorized budget.',
        },
      ]}
      initial={{ expenseDate: businessDate() }}
      onClose={onClose}
      onSave={async (v) => {
        await save.mutateAsync(v);
        onSaved();
      }}
    />
  );
}
export function ReverseExpenseDialog({
  expense,
  onClose,
  onSaved,
}: {
  expense: Pick<ExpenseRecord, 'id' | 'amount'>;
  onClose: () => void;
  onSaved: () => void;
}) {
  const save = useCoreMutation((v: Record<string, string>) =>
    api.post(`/expenses/${expense.id}/reverse`, v),
  );
  return (
    <RecordForm
      title={`Reverse posted expense · ${currency(expense.amount)}`}
      fields={[
        {
          name: 'comment',
          label: 'Reversal reason',
          type: 'textarea',
          required: true,
          max: 2000,
          hint: 'Creates an exact negative entry and preserves the original expense. Submit a new approved request for a corrected amount.',
        },
        { name: 'expenseDate', label: 'Reversal date', type: 'date', required: true },
      ]}
      initial={{ expenseDate: businessDate() }}
      onClose={onClose}
      onSave={async (v) => {
        await save.mutateAsync(v);
        onSaved();
      }}
    />
  );
}
