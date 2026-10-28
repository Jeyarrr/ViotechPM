import * as Dialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import type { ReactNode } from 'react';

export function NavigationSheet({
  open,
  onOpenChange,
  children,
}: {
  open: boolean;
  onOpenChange: (value: boolean) => void;
  children: ReactNode;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="sheet-overlay" />
        <Dialog.Content className="sheet-content" aria-describedby={undefined}>
          <Dialog.Title className="sr-only">Workspace navigation</Dialog.Title>
          <Dialog.Close
            className="sheet-close button button-ghost button-icon"
            aria-label="Close navigation"
          >
            <X size={18} />
          </Dialog.Close>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
