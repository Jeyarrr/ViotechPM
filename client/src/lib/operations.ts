export const transactionStatuses = [
  'DRAFT',
  'SUBMITTED',
  'UNDER_REVIEW',
  'APPROVED',
  'REJECTED',
  'RETURNED_FOR_REVISION',
  'CANCELLED',
];
export const operationLabel = (value: string) =>
  value
    .toLowerCase()
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
export const businessDate = () =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
