import { useState, type ReactNode } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { X, LoaderCircle, FolderOpen } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ApiError } from '@/services/api';
import { EmptyState } from './feedback';
import type { PageResult } from '@/types/core';

export function RecordDialog({
  title,
  description,
  onClose,
  children,
  busy = false,
}: {
  title: string;
  description: string;
  onClose: () => void;
  children: ReactNode;
  busy?: boolean;
}) {
  return (
    <Dialog.Root
      open
      onOpenChange={(open) => {
        if (!open && !busy) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="crud-overlay" />
        <Dialog.Content
          className="crud-dialog"
          onEscapeKeyDown={(event) => {
            if (busy) event.preventDefault();
          }}
          onInteractOutside={(event) => event.preventDefault()}
        >
          <div className="crud-dialog-heading">
            <div>
              <Dialog.Title>{title}</Dialog.Title>
              <Dialog.Description>{description}</Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <Button variant="ghost" size="icon" aria-label="Close dialog" disabled={busy}>
                <X size={18} />
              </Button>
            </Dialog.Close>
          </div>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export interface FormField {
  name: string;
  label: string;
  type?: 'email' | 'password' | 'date' | 'textarea' | 'select' | 'number';
  required?: boolean;
  max?: number;
  options?: { value: string; label: string }[];
  hint?: string;
}
export function RecordForm({
  title,
  fields,
  initial = {},
  onSave,
  onClose,
}: {
  title: string;
  fields: FormField[];
  initial?: Record<string, string>;
  onSave: (values: Record<string, string>) => Promise<unknown>;
  onClose: () => void;
}) {
  const [error, setError] = useState('');
  const schema = z.record(z.string(), z.string()).superRefine((data, ctx) => {
    for (const field of fields) {
      const value = (data[field.name] ?? '').trim();
      let message = '';
      if (field.required && !value) message = `${field.label} is required.`;
      else if (value && field.type === 'email' && !z.email().safeParse(value).success)
        message = 'Enter a valid email address.';
      else if (field.max && value.length > field.max)
        message = `Use at most ${field.max} characters.`;
      else if (
        field.type === 'select' &&
        value &&
        !field.options?.some((option) => option.value === value)
      )
        message = 'Choose an available option.';
      if (message) ctx.addIssue({ code: 'custom', path: [field.name], message });
    }
  });
  const {
    register,
    handleSubmit,
    setError: setFieldError,
    formState: { errors, isSubmitting },
  } = useForm<Record<string, string>>({
    resolver: zodResolver(schema),
    defaultValues: Object.fromEntries(
      fields.map((field) => [field.name, initial[field.name] ?? '']),
    ),
  });
  const submit = handleSubmit(async (values) => {
    setError('');
    try {
      await onSave(values);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save. Please try again.');
      if (err instanceof ApiError)
        for (const field of err.fields) setFieldError(field.field, { message: field.message });
    }
  });
  return (
    <RecordDialog
      title={title}
      description="Changes are saved to your workspace when you select Save."
      onClose={onClose}
      busy={isSubmitting}
    >
      <form onSubmit={submit} noValidate>
        <div className="crud-form-grid">
          {fields.map((field) => (
            <div
              className={`form-field ${field.type === 'textarea' ? 'field-wide' : ''}`}
              key={field.name}
            >
              <label htmlFor={`field-${field.name}`}>
                {field.label}
                {field.required && <span aria-hidden="true"> *</span>}
              </label>
              {field.type === 'select' ? (
                <select
                  className="input"
                  id={`field-${field.name}`}
                  {...register(field.name)}
                  disabled={isSubmitting}
                  aria-invalid={!!errors[field.name]}
                  aria-describedby={`hint-${field.name}`}
                >
                  <option value="">Select {field.label.toLowerCase()}</option>
                  {field.options?.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              ) : field.type === 'textarea' ? (
                <textarea
                  className="input"
                  id={`field-${field.name}`}
                  {...register(field.name)}
                  rows={3}
                  maxLength={field.max}
                  disabled={isSubmitting}
                  aria-invalid={!!errors[field.name]}
                  aria-describedby={`hint-${field.name}`}
                />
              ) : (
                <input
                  className="input"
                  id={`field-${field.name}`}
                  {...register(field.name)}
                  type={field.type ?? 'text'}
                  step={field.type === 'number' ? '0.01' : undefined}
                  maxLength={field.max}
                  autoComplete={field.type === 'password' ? 'new-password' : 'off'}
                  disabled={isSubmitting}
                  aria-invalid={!!errors[field.name]}
                  aria-describedby={`hint-${field.name}`}
                />
              )}
              <p
                id={`hint-${field.name}`}
                className={errors[field.name] ? 'field-error' : 'field-hint'}
              >
                {errors[field.name]?.message ?? field.hint}
              </p>
            </div>
          ))}
        </div>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <div className="crud-dialog-actions">
          <Button type="button" variant="outline" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button disabled={isSubmitting}>
            {isSubmitting && <LoaderCircle size={15} className="animate-spin" />}
            {isSubmitting ? 'Saving…' : 'Save'}
          </Button>
        </div>
      </form>
    </RecordDialog>
  );
}

export function ConfirmAction({
  title,
  description,
  onConfirm,
  onClose,
}: {
  title: string;
  description: string;
  onConfirm: () => Promise<unknown>;
  onClose: () => void;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  return (
    <RecordDialog title={title} description={description} onClose={onClose} busy={busy}>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <div className="crud-dialog-actions">
        <Button variant="outline" onClick={onClose} disabled={busy}>
          Cancel
        </Button>
        <Button
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await onConfirm();
              onClose();
            } catch (err) {
              setError(err instanceof Error ? err.message : 'Unable to complete this action.');
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? 'Saving…' : 'Confirm'}
        </Button>
      </div>
    </RecordDialog>
  );
}
export function RecordTable<T extends { id: string }>({
  data,
  columns,
  loading = false,
  onPage,
}: {
  data?: PageResult<T>;
  columns: { label: string; render: (row: T) => ReactNode }[];
  loading?: boolean;
  onPage: (page: number) => void;
}) {
  if (loading)
    return (
      <div className="crud-loading" role="status">
        <LoaderCircle className="animate-spin" size={20} />
        Loading records…
      </div>
    );
  if (!data?.items.length)
    return (
      <EmptyState
        icon={FolderOpen}
        title="No records found"
        description="Add a record or adjust your search and filters."
      />
    );
  return (
    <>
      <div className="crud-table-wrap">
        <table className="crud-table">
          <thead>
            <tr>
              {columns.map((col) => (
                <th key={col.label} scope="col">
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.items.map((row) => (
              <tr key={row.id}>
                {columns.map((col) => (
                  <td data-label={col.label} key={col.label}>
                    {col.render(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="crud-pagination">
        <span>
          {data.total} records · Page {data.page} of {data.pages}
        </span>
        <div>
          <Button
            variant="outline"
            size="sm"
            disabled={data.page <= 1}
            onClick={() => onPage(data.page - 1)}
          >
            Previous
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={data.page >= data.pages}
            onClick={() => onPage(data.page + 1)}
          >
            Next
          </Button>
        </div>
      </div>
    </>
  );
}
export function StatusBadge({ value }: { value: string }) {
  return (
    <span className={`record-badge badge-${value.toLowerCase()}`}>
      {value.replaceAll('_', ' ')}
    </span>
  );
}
export function Notice({ message, dismiss }: { message: string; dismiss: () => void }) {
  return message ? (
    <div className="crud-toast" role="status">
      <span>{message}</span>
      <Button variant="ghost" size="icon" onClick={dismiss} aria-label="Dismiss notification">
        <X size={16} />
      </Button>
    </div>
  ) : null;
}
