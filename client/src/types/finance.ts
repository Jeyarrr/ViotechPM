import type { Lookup, PageResult } from './core';
export interface BudgetNumbers {
  budget: string | null;
  totalExpenses: string;
  remainingBudget: string | null;
  utilization: string | null;
}
export interface BudgetProject extends Lookup, BudgetNumbers {
  archivedAt: string | null;
  client: Lookup;
}
export interface ExpenseRecord {
  id: string;
  projectId: string;
  transactionId: string | null;
  category: string;
  description: string;
  amount: string;
  expenseDate: string;
  kind: string;
  recordedById: string;
  createdAt: string;
  reversalOfId: string | null;
  reversalReason: string | null;
  canReverse?: boolean;
  project: Lookup & { managerId: string; archivedAt: string | null; client: Lookup };
  transaction: { id: string; reference: string; title: string } | null;
  recordedBy: Lookup;
  reversalOf: {
    id: string;
    amount: string;
    transaction: { id: string; reference: string } | null;
  } | null;
  reversedBy: {
    id: string;
    amount: string;
    expenseDate: string;
    reversalReason: string | null;
  } | null;
}
export interface ExpenseSummary {
  currency: string;
  totals: BudgetNumbers;
  filteredExpenses: string;
  unbudgetedProjects: number;
  projects: PageResult<BudgetProject>;
  categories: { category: string; amount: string }[];
}
export interface PostableTransaction {
  id: string;
  reference: string;
  title: string;
  requestedAmount: string;
  project: { name: string };
}
export interface FinanceOptions {
  projects: PageResult<Lookup & { archivedAt: string | null; client: Lookup }>;
  categories: string[];
}
