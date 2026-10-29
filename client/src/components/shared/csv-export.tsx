import { useState } from 'react';
import { Download } from 'lucide-react';
import { api } from '@/services/api';
import { queryString } from '@/hooks/use-core';
import { Button } from '@/components/ui/button';
export function CsvExport({
  kind,
  filters,
}: {
  kind: 'milestones' | 'transactions' | 'expenses';
  filters: Record<string, string | number | undefined>;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  return (
    <div className="export-action">
      <Button
        variant="outline"
        size="sm"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError('');
          try {
            await api.download(
              `/reports/${kind}/export?${queryString(filters)}`,
              `viotechpm-${kind}.csv`,
            );
          } catch (e) {
            setError(e instanceof Error ? e.message : 'Unable to export.');
          } finally {
            setBusy(false);
          }
        }}
      >
        <Download size={14} />
        {busy ? 'Exporting…' : 'Export CSV'}
      </Button>
      {error && (
        <p role="alert" className="field-error">
          {error}
        </p>
      )}
    </div>
  );
}
