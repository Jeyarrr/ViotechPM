import { useState } from 'react';
import { Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { useCoreMutation, queryString } from '@/hooks/use-core';
import { api } from '@/services/api';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ConfirmAction } from '@/components/shared/crud';
import type { PageResult } from '@/types/core';

type Comment = {
  id: string;
  content: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  author: { id: string; name: string };
  mentions: { user: { id: string; name: string } }[];
  canEdit: boolean;
  canDelete: boolean;
};
const time = (value: string) =>
  new Date(value).toLocaleString('en-PH', { timeZone: 'Asia/Manila' });
export function TaskDiscussion({
  taskId,
  readOnly = false,
}: {
  taskId: string;
  readOnly?: boolean;
}) {
  const [page, setPage] = useState(1),
    [content, setContent] = useState(''),
    [mentions, setMentions] = useState<string[]>([]),
    [editing, setEditing] = useState<string | null>(null),
    [editText, setEditText] = useState(''),
    [deleting, setDeleting] = useState<string | null>(null);
  const query = useQuery({
    queryKey: ['core', 'comments', taskId, page],
    queryFn: () => api.get<PageResult<Comment>>(`/tasks/${taskId}/comments?page=${page}`),
  });
  const options = useQuery({
    queryKey: ['core', 'mention-options', taskId],
    queryFn: () => api.get<{ id: string; name: string }[]>(`/tasks/${taskId}/mention-options`),
    enabled: !readOnly,
  });
  const create = useCoreMutation(() =>
    api.post(`/tasks/${taskId}/comments`, { content, mentionIds: mentions }),
  );
  const edit = useCoreMutation((id: string) =>
    api.patch(`/tasks/${taskId}/comments/${id}`, { content: editText }),
  );
  const remove = useCoreMutation((id: string) => api.delete(`/tasks/${taskId}/comments/${id}`));
  return (
    <Card className="detail-panel discussion">
      <h2 className="card-title">Discussion</h2>
      <p className="muted">
        Discuss this task with its authorized team. Authors can edit or delete within 24 hours.
      </p>
      {!readOnly && (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            try {
              await create.mutateAsync(undefined);
              setContent('');
              setMentions([]);
              setPage(1);
            } catch {
              /* rendered below */
            }
          }}
        >
          <label htmlFor={`comment-${taskId}`}>New comment</label>
          <textarea
            id={`comment-${taskId}`}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            maxLength={4000}
            required
            rows={3}
          />
          <label>
            Mention team members{' '}
            <select
              multiple
              value={mentions}
              onChange={(e) => setMentions([...e.target.selectedOptions].map((o) => o.value))}
            >
              {options.data?.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.name}
                </option>
              ))}
            </select>
          </label>
          <small className="muted">
            Optional. Select people to notify; this does not grant task access.
          </small>
          <Button disabled={create.isPending || !content.trim()} type="submit">
            {create.isPending ? 'Posting…' : 'Post comment'}
          </Button>
        </form>
      )}
      {(query.error || create.error || edit.error || options.error) && (
        <p role="alert">
          {query.error?.message ??
            create.error?.message ??
            edit.error?.message ??
            options.error?.message}
        </p>
      )}
      {query.isPending && <p role="status">Loading discussion…</p>}
      {query.data?.items.length === 0 && (
        <p className="notification-empty">No comments yet. Start the discussion.</p>
      )}
      {query.data?.items.map((comment) => (
        <article className="discussion-comment" key={comment.id}>
          <div className="notification-heading">
            <strong>{comment.author.name}</strong>
            <time>
              {time(comment.createdAt)}
              {comment.updatedAt !== comment.createdAt && !comment.deletedAt ? ' · Edited' : ''}
            </time>
          </div>
          {editing === comment.id ? (
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                try {
                  await edit.mutateAsync(comment.id);
                  setEditing(null);
                } catch {
                  /* rendered above */
                }
              }}
            >
              <textarea
                aria-label="Edit comment"
                value={editText}
                onChange={(e) => setEditText(e.target.value)}
                maxLength={4000}
                required
              />
              <div className="row-actions">
                <Button disabled={edit.isPending} type="submit">
                  Save comment
                </Button>
                <Button variant="ghost" type="button" onClick={() => setEditing(null)}>
                  Cancel
                </Button>
              </div>
            </form>
          ) : (
            <p className="comment-content">
              {comment.deletedAt ? 'This comment was deleted.' : comment.content}
            </p>
          )}
          {comment.mentions.length > 0 && (
            <p className="muted">
              Mentioned: {comment.mentions.map((m) => m.user.name).join(', ')}
            </p>
          )}
          <div className="row-actions">
            {comment.canEdit && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setEditing(comment.id);
                  setEditText(comment.content);
                }}
              >
                Edit
              </Button>
            )}
            {comment.canDelete && (
              <Button size="sm" variant="ghost" onClick={() => setDeleting(comment.id)}>
                Delete
              </Button>
            )}
          </div>
        </article>
      ))}
      {query.data && query.data.pages > 1 && (
        <div className="notification-heading">
          <Button variant="outline" disabled={page <= 1} onClick={() => setPage(page - 1)}>
            Previous comments
          </Button>
          <span>
            Page {page} of {query.data.pages}
          </span>
          <Button
            variant="outline"
            disabled={page >= query.data.pages}
            onClick={() => setPage(page + 1)}
          >
            Next comments
          </Button>
        </div>
      )}
      {deleting && (
        <ConfirmAction
          title="Delete comment?"
          description="The discussion will show a deleted placeholder. Audit history is retained."
          onClose={() => setDeleting(null)}
          onConfirm={async () => {
            await remove.mutateAsync(deleting);
            setDeleting(null);
          }}
        />
      )}
    </Card>
  );
}
type Activity = {
  id: string;
  description: string;
  timestamp: string;
  actor: { id: string; name: string } | null;
  href: string;
};
export function ProjectActivity({ projectId }: { projectId: string }) {
  const [filters, setFilters] = useState({
    type: '',
    actorId: '',
    dateFrom: '',
    dateTo: '',
    page: 1,
  });
  const query = useQuery({
    queryKey: ['core', 'activities', projectId, filters],
    queryFn: () =>
      api.get<PageResult<Activity>>(`/projects/${projectId}/activities?${queryString(filters)}`),
  });
  const members = useQuery({
    queryKey: ['core', 'activity-members', projectId],
    queryFn: () =>
      api.get<PageResult<{ user: { id: string; name: string } }>>(
        `/projects/${projectId}/members?pageSize=100`,
      ),
  });
  return (
    <Card className="detail-panel">
      <h2 className="card-title">Project activity</h2>
      <div className="notification-filters">
        <label>
          Activity type{' '}
          <select
            value={filters.type}
            onChange={(e) => setFilters({ ...filters, page: 1, type: e.target.value })}
          >
            <option value="">All activity</option>
            {['project', 'task', 'milestone', 'transaction', 'comment', 'document'].map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
        </label>
        <label>
          Team member{' '}
          <select
            value={filters.actorId}
            onChange={(e) => setFilters({ ...filters, page: 1, actorId: e.target.value })}
          >
            <option value="">All members</option>
            {members.data?.items.map((m) => (
              <option value={m.user.id} key={m.user.id}>
                {m.user.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          From{' '}
          <input
            type="date"
            value={filters.dateFrom}
            onChange={(e) => setFilters({ ...filters, page: 1, dateFrom: e.target.value })}
          />
        </label>
        <label>
          To{' '}
          <input
            type="date"
            value={filters.dateTo}
            onChange={(e) => setFilters({ ...filters, page: 1, dateTo: e.target.value })}
          />
        </label>
      </div>
      {query.isError && <p role="alert">{query.error.message}</p>}
      {query.isPending && <p role="status">Loading activity…</p>}
      <ul className="data-list">
        {query.data?.items.map((item) => (
          <li key={item.id}>
            <span>
              <Link to={item.href}>{item.description}</Link>
              <small>{item.actor?.name ?? 'System'}</small>
            </span>
            <time>{time(item.timestamp)}</time>
          </li>
        ))}
      </ul>
      {query.data?.total === 0 && <p>No activity matches these filters.</p>}
      {query.data && (
        <div className="notification-heading">
          <Button
            variant="outline"
            disabled={filters.page <= 1}
            onClick={() => setFilters({ ...filters, page: filters.page - 1 })}
          >
            Previous activity
          </Button>
          <span>
            Page {filters.page} of {query.data.pages}
          </span>
          <Button
            variant="outline"
            disabled={filters.page >= query.data.pages}
            onClick={() => setFilters({ ...filters, page: filters.page + 1 })}
          >
            Next activity
          </Button>
        </div>
      )}
    </Card>
  );
}
