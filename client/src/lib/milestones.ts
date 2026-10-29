export const milestoneStatuses = [
  'NOT_STARTED',
  'IN_PROGRESS',
  'IN_REVIEW',
  'COMPLETED',
  'DELAYED',
];
export const milestoneLabel = (value: string) =>
  value
    .toLowerCase()
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
