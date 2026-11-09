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
  const commit = () => {
    committed = true;
    flushSync(update);
  };
  root.dataset.loginTransition = 'unfold';
  try {
    const transition = document.startViewTransition(commit);
    await transition.finished;
  } catch {
    // A skipped animation must never prevent a successful sign-in.
    if (!committed) commit();
  } finally {
    delete root.dataset.loginTransition;
  }
}
