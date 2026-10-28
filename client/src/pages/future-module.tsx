import { Link, useLocation } from 'react-router';
import { ArrowLeft, ArrowUpRight, LockKeyhole, Sparkles } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { allNavigation } from '@/routes/navigation';
import { useAuth } from '@/hooks/use-auth';
import { Button } from '@/components/ui/button';
import { api } from '@/services/api';

export function FutureModulePage() {
  const { pathname } = useLocation();
  const { data: user } = useAuth();
  const item = allNavigation.find((entry) => entry.path === pathname);
  const system = useQuery({
    queryKey: ['system-access'],
    queryFn: () => api.get('/system/access'),
    enabled: pathname === '/settings' && !!user?.permissions.includes('system:manage'),
  });
  if (!item || (item.permission && !user?.permissions.includes(item.permission)))
    return (
      <div className="future-page">
        <span className="future-icon">
          <LockKeyhole />
        </span>
        <h1>Access restricted</h1>
        <p>Your role does not have access to this area.</p>
        <Button asChild variant="secondary">
          <Link to="/">Back to overview</Link>
        </Button>
      </div>
    );
  return (
    <div className="future-module">
      <div className="page-heading">
        <div>
          <div className="heading-eyebrow">YOUR WORKSPACE</div>
          <h1>{item.title}</h1>
          <p>Everything in its place. More on the way.</p>
        </div>
        <span className="subtle-pill">Future phase</span>
      </div>
      <section className="future-page">
        <span className="future-icon">
          <item.icon size={30} strokeWidth={1.4} />
        </span>
        <span className="eyebrow">
          <Sparkles size={12} />
          COMING IN A FUTURE PHASE
        </span>
        <h2>
          A little more clarity.
          <br />
          Coming your way.
        </h2>
        <p>{item.description}</p>
        <div className="future-boundary">
          <span className="status-dot" />
          This module is planned and is not available yet.
        </div>
        {system.isError && (
          <p role="alert" className="field-error">
            Unable to verify system access. {system.error.message}
          </p>
        )}
        <Button asChild variant="secondary">
          <Link to="/">
            <ArrowLeft size={15} />
            Back to overview
          </Link>
        </Button>
      </section>
      <div className="future-bottom">
        <span>ViotechPM is growing with your team.</span>
        <ArrowUpRight size={16} />
      </div>
    </div>
  );
}
