import { flushSync } from 'react-dom';

// Match the eDTR login: fold both panels outward only after sign-in succeeds.
export async function unfoldLogin(update: () => void) {
  if (
    !document.startViewTransition ||
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  ) {
    update();
    return;
  }
  const root = document.documentElement;
  let committed = false;
  const commit = async () => {
    committed = true;
    flushSync(update);
    // React Router and lazy routes can commit after flushSync. Keep the login
    // snapshot until the workspace mounts, rather than unfolding onto a loader.
    if (!document.querySelector('.app-shell')) {
      await new Promise<void>((resolve) => {
        const finish = () => {
          observer.disconnect();
          window.clearTimeout(timeout);
          resolve();
        };
        const observer = new MutationObserver(() => {
          if (document.querySelector('.app-shell')) finish();
        });
        const timeout = window.setTimeout(finish, 2000);
        observer.observe(document.body, { childList: true, subtree: true });
      });
    }
  };
  root.dataset.loginTransition = 'unfold';
  try {
    const transition = document.startViewTransition(commit);
    await transition.finished;
  } catch {
    // A skipped animation must never prevent a successful sign-in.
    if (!committed) await commit();
  } finally {
    delete root.dataset.loginTransition;
  }
}
