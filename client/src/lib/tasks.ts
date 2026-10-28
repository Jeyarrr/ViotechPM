export const taskStatuses = ['TODO', 'IN_PROGRESS', 'IN_REVIEW', 'COMPLETED', 'BLOCKED'];
export const taskLabel = (value: string) =>
  value === 'TODO'
    ? 'To Do'
    : value
        .toLowerCase()
        .replaceAll('_', ' ')
        .replace(/\b\w/g, (c) => c.toUpperCase());
