import { Mail, Building2, ShieldCheck, CalendarDays, UserRound } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { initials } from '@/lib/utils';
import { Card } from '@/components/ui/card';

export function ProfilePage() {
  const { data: user } = useAuth();
  if (!user) return null;
  const date = (value: string | null) =>
    value
      ? new Intl.DateTimeFormat('en-PH', { dateStyle: 'medium', timeZone: 'Asia/Manila' }).format(
          new Date(value),
        )
      : 'Not recorded';
  return (
    <div>
      <div className="page-heading">
        <div>
          <div className="heading-eyebrow">YOUR ACCOUNT</div>
          <h1>My profile</h1>
          <p>Your place in the Viotech workspace.</p>
        </div>
      </div>
      <Card className="profile-card">
        <div className="profile-banner" />
        <div className="profile-main">
          <span className="avatar profile-avatar">{initials(user.name)}</span>
          <span className="subtle-pill">
            <span className="status-dot" />
            Active account
          </span>
          <h2>{user.name}</h2>
          <p>{user.role.name}</p>
        </div>
        <dl className="profile-fields">
          {[
            { icon: Mail, label: 'Email address', value: user.email },
            { icon: ShieldCheck, label: 'Assigned role', value: user.role.name },
            {
              icon: Building2,
              label: 'Department',
              value: user.department?.name ?? 'Not assigned',
            },
            { icon: CalendarDays, label: 'Member since', value: date(user.createdAt) },
            { icon: UserRound, label: 'Last sign-in', value: date(user.lastLoginAt) },
          ].map((field) => (
            <div key={field.label}>
              <dt>
                <field.icon size={16} />
                {field.label}
              </dt>
              <dd>{field.value}</dd>
            </div>
          ))}
        </dl>
        <div className="profile-note">
          To update your account details, contact your system administrator.
        </div>
      </Card>
    </div>
  );
}
