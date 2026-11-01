import { useState, type FormEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import { api } from '@/services/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';

export function PasswordChange() {
  const [current, setCurrent] = useState(''),
    [next, setNext] = useState(''),
    [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const client = useQueryClient(),
    navigate = useNavigate();
  async function submit(event: FormEvent) {
    event.preventDefault();
    setError('');
    if (next !== confirmation) {
      setError('New passwords do not match.');
      return;
    }
    setBusy(true);
    try {
      await api.post('/auth/password', { currentPassword: current, newPassword: next });
      client.clear();
      client.setQueryData(['auth', 'me'], null);
      navigate('/login', { replace: true });
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Unable to update password.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <Card className="detail-panel">
      <h2>Change password</h2>
      <p>
        Use a unique password of 16 to 128 characters. Updating it signs you out on all devices.
      </p>
      <form onSubmit={submit} className="crud-form">
        <label htmlFor="current-password">Current password</label>
        <Input
          id="current-password"
          type="password"
          autoComplete="current-password"
          required
          maxLength={128}
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
        />
        <label htmlFor="new-password">New password</label>
        <Input
          id="new-password"
          type="password"
          autoComplete="new-password"
          required
          minLength={16}
          maxLength={128}
          value={next}
          onChange={(e) => setNext(e.target.value)}
        />
        <label htmlFor="confirm-password">Confirm new password</label>
        <Input
          id="confirm-password"
          type="password"
          autoComplete="new-password"
          required
          minLength={16}
          maxLength={128}
          value={confirmation}
          onChange={(e) => setConfirmation(e.target.value)}
        />
        {error && <p role="alert">{error}</p>}
        <Button type="submit" disabled={busy}>
          {busy ? 'Updating password...' : 'Update password and sign out'}
        </Button>
      </form>
    </Card>
  );
}
