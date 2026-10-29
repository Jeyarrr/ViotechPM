import { useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  ArrowRight,
  Eye,
  EyeOff,
  LoaderCircle,
  ShieldCheck,
  Workflow,
  FolderKanban,
  UsersRound,
} from 'lucide-react';
import { motion } from 'motion/react';
import { Brand } from '@/components/shared/brand';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuth, useLogin } from '@/hooks/use-auth';
import { LoadingScreen } from '@/components/shared/feedback';

const loginSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .max(254)
    .pipe(z.union([z.literal('admin'), z.email()])),
  password: z.string().min(1, 'Enter your password.').max(128),
});
type LoginInput = z.infer<typeof loginSchema>;

export function LoginPage() {
  const auth = useAuth();
  const login = useLogin();
  const navigate = useNavigate();
  const location = useLocation();
  const [visible, setVisible] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  });
  if (auth.isPending) return <LoadingScreen />;
  if (auth.data) return <Navigate to="/" replace />;
  const submit = handleSubmit(async (input) => {
    try {
      await login.mutateAsync(input);
      const from = (location.state as { from?: string } | null)?.from;
      navigate(from?.startsWith('/') && !from.startsWith('//') && from !== '/login' ? from : '/', {
        replace: true,
      });
    } catch {
      /* Mutation error is presented below. */
    }
  });
  return (
    <div className="login-page">
      <section className="login-story" aria-label="About ViotechPM">
        <Link to="/login" className="login-brand-link">
          <Brand compact />
        </Link>
        <div className="story-main">
          <span className="eyebrow">
            <span className="small-line" />
            VIOTECH PROJECT OPERATIONS
          </span>
          <h1>
            Project operations.
            <br />
            <span>One workspace.</span>
          </h1>
          <p>
            One connected workspace for the people,
            <br className="desktop-break" /> projects, and ideas moving Viotech forward.
          </p>
          <div className="login-capabilities" aria-label="Workspace direction">
            {[
              {
                icon: FolderKanban,
                title: 'Projects & delivery',
                description: 'A connected view of client engagements and delivery.',
              },
              {
                icon: Workflow,
                title: 'Tasks & milestones',
                description: 'Clear responsibilities. Focused execution.',
              },
              {
                icon: UsersRound,
                title: 'People & resources',
                description: 'One workspace for the teams behind the work.',
              },
            ].map((item) => (
              <div className="login-capability" key={item.title}>
                <span>
                  <item.icon size={18} strokeWidth={1.6} />
                </span>
                <div>
                  <strong>{item.title}</strong>
                  <p>{item.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="story-footer">
          <span>VIOTECH I.T. SOLUTIONS</span>
          <span>
            Your work, connected.
            <ArrowRight size={15} />
          </span>
        </div>
      </section>
      <section className="login-form-panel">
        <div className="login-mobile-brand">
          <Brand compact />
        </div>
        <motion.div
          className="login-form-wrap"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
        >
          <span className="eyebrow">YOUR VIOTECH WORKSPACE</span>
          <h2>Welcome back.</h2>
          <p className="login-intro">Sign in to get a clear picture of your work.</p>
          <form onSubmit={submit} noValidate>
            <div className="form-field">
              <label htmlFor="email">Email or username</label>
              <Input
                id="email"
                type="text"
                autoComplete="username"
                placeholder="you@viotech.com"
                aria-invalid={!!errors.email}
                aria-describedby={errors.email ? 'email-error' : undefined}
                disabled={login.isPending}
                {...register('email')}
              />
              {errors.email && (
                <p id="email-error" className="field-error">
                  {errors.email.message}
                </p>
              )}
            </div>
            <div className="form-field">
              <label htmlFor="password">Password</label>
              <div className="password-input">
                <Input
                  id="password"
                  type={visible ? 'text' : 'password'}
                  autoComplete="current-password"
                  placeholder="Enter your password"
                  aria-invalid={!!errors.password}
                  aria-describedby={errors.password ? 'password-error' : undefined}
                  disabled={login.isPending}
                  {...register('password')}
                />
                <button
                  type="button"
                  className="password-toggle"
                  aria-label={visible ? 'Hide password' : 'Show password'}
                  aria-pressed={visible}
                  onClick={() => setVisible(!visible)}
                >
                  {visible ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
              {errors.password && (
                <p id="password-error" className="field-error">
                  {errors.password.message}
                </p>
              )}
            </div>
            {login.isError && (
              <div className="form-error" role="alert">
                {login.error.message}
              </div>
            )}
            <Button type="submit" className="login-submit" disabled={login.isPending}>
              {login.isPending ? (
                <>
                  <LoaderCircle className="animate-spin" size={17} />
                  Signing in…
                </>
              ) : (
                <>
                  Sign in to workspace
                  <ArrowRight size={17} />
                </>
              )}
            </Button>
          </form>
          <p className="login-help">
            Need access or help signing in?
            <br />
            <span>Contact your Viotech system administrator.</span>
          </p>
          <div className="login-security">
            <ShieldCheck size={15} />
            <span>Protected sign-in for your company workspace.</span>
          </div>
        </motion.div>
        <div className="login-form-footer">
          <span>ViotechPM · Project Management</span>
          <span>© {new Date().getFullYear()} Viotech</span>
        </div>
      </section>
    </div>
  );
}
