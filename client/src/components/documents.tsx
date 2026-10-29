import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useCoreMutation } from '@/hooks/use-core';
import { api } from '@/services/api';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ConfirmAction } from '@/components/shared/crud';
import type { PageResult } from '@/types/core';

type Document = {
  id: string;
  originalName: string;
  mimeType: string;
  size: number;
  createdAt: string;
  uploadedBy: { name: string };
  task: { title: string } | null;
  canArchive: boolean;
};
export function ProjectDocuments({
  projectId,
  taskId,
  readOnly = false,
}: {
  projectId: string;
  taskId?: string;
  readOnly?: boolean;
}) {
  const [page, setPage] = useState(1),
    [file, setFile] = useState<File | null>(null),
    [progress, setProgress] = useState(0),
    [error, setError] = useState(''),
    [archiving, setArchiving] = useState<Document | null>(null),
    [inputKey, setInputKey] = useState(0);
  const query = useQuery({
    queryKey: ['core', 'documents', projectId, taskId, page],
    queryFn: () =>
      api.get<PageResult<Document>>(
        `/projects/${projectId}/documents?page=${page}${taskId ? `&taskId=${taskId}` : ''}`,
      ),
  });
  const upload = useCoreMutation((file: File) =>
    api.upload(
      `/projects/${projectId}/documents${taskId ? `?taskId=${taskId}` : ''}`,
      file,
      setProgress,
    ),
  );
  const archive = useCoreMutation((id: string) => api.delete(`/documents/${id}`));
  return (
    <Card className="detail-panel">
      <h2 className="card-title">{taskId ? 'Task attachments' : 'Project documents'}</h2>
      <p className="muted">
        Private project files. PDF, PNG, JPEG, WebP, TXT and CSV. Default limit: 10 MB per file.
      </p>
      {!readOnly && (
        <form
          className="document-upload"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!file) return;
            setError('');
            setProgress(0);
            try {
              await upload.mutateAsync(file);
              setFile(null);
              setInputKey(inputKey + 1);
              setPage(1);
            } catch (error) {
              setError((error as Error).message);
            }
          }}
        >
          <label>
            Choose document{' '}
            <input
              key={inputKey}
              type="file"
              accept=".pdf,.png,.jpg,.jpeg,.webp,.txt,.csv"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              disabled={upload.isPending}
            />
          </label>
          <Button type="submit" disabled={!file || upload.isPending}>
            {upload.isPending ? `Uploading ${progress}%` : 'Upload document'}
          </Button>
          {upload.isPending && <progress value={progress} max={100} aria-label="Upload progress" />}
        </form>
      )}
      {(error || query.error) && <p role="alert">{error || query.error?.message}</p>}
      {query.isPending && <p role="status">Loading documents…</p>}
      {query.data?.total === 0 && <p className="notification-empty">No documents uploaded yet.</p>}
      <ul className="data-list document-list">
        {query.data?.items.map((item) => (
          <li key={item.id}>
            <span>
              <strong>{item.originalName}</strong>
              <small>
                {(item.size / 1024).toFixed(1)} KB · {item.mimeType} · {item.uploadedBy.name}
                <br />
                {new Date(item.createdAt).toLocaleString('en-PH', { timeZone: 'Asia/Manila' })}
                {item.task ? ` · ${item.task.title}` : ''}
              </small>
            </span>
            <div className="row-actions">
              <Button
                variant="outline"
                size="sm"
                onClick={async () => {
                  setError('');
                  try {
                    await api.download(`/documents/${item.id}/download`, item.originalName);
                  } catch (error) {
                    setError((error as Error).message);
                  }
                }}
              >
                Download
              </Button>
              {item.canArchive && !readOnly && (
                <Button variant="ghost" size="sm" onClick={() => setArchiving(item)}>
                  Archive
                </Button>
              )}
            </div>
          </li>
        ))}
      </ul>
      {query.data && query.data.pages > 1 && (
        <div className="notification-heading">
          <Button variant="outline" disabled={page <= 1} onClick={() => setPage(page - 1)}>
            Previous documents
          </Button>
          <span>
            Page {page} of {query.data.pages}
          </span>
          <Button
            variant="outline"
            disabled={page >= query.data.pages}
            onClick={() => setPage(page + 1)}
          >
            Next documents
          </Button>
        </div>
      )}
      {archiving && (
        <ConfirmAction
          title={`Archive ${archiving.originalName}?`}
          description="The file will no longer be downloadable. Its metadata and audit history are retained."
          onClose={() => setArchiving(null)}
          onConfirm={() => archive.mutateAsync(archiving.id)}
        />
      )}
    </Card>
  );
}
