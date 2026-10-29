export function DeadlineIndicator({
  dueDate,
  status,
  archived = false,
}: {
  dueDate: string;
  status: string;
  archived?: boolean;
}) {
  if (archived || ['COMPLETED', 'CANCELLED'].includes(status)) return null;
  const day = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
  const days = Math.round(
    (Date.parse(`${dueDate.slice(0, 10)}T00:00:00Z`) - Date.parse(`${day}T00:00:00Z`)) / 86400000,
  );
  if (days > 3) return null;
  return (
    <small className={days < 0 ? 'field-error' : 'muted'}>
      {days < 0
        ? 'Overdue'
        : days === 0
          ? 'Due today'
          : `Due in ${days} day${days === 1 ? '' : 's'}`}
    </small>
  );
}
