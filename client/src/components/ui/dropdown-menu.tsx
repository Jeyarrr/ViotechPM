import * as Dropdown from '@radix-ui/react-dropdown-menu';
import { cn } from '@/lib/utils';
import type { ComponentProps } from 'react';

export const DropdownMenu = Dropdown.Root;
export const DropdownMenuTrigger = Dropdown.Trigger;
export function DropdownMenuContent({
  className,
  sideOffset = 8,
  ...props
}: ComponentProps<typeof Dropdown.Content>) {
  return (
    <Dropdown.Portal>
      <Dropdown.Content
        sideOffset={sideOffset}
        className={cn('dropdown-content', className)}
        {...props}
      />
    </Dropdown.Portal>
  );
}
export function DropdownMenuItem({ className, ...props }: ComponentProps<typeof Dropdown.Item>) {
  return <Dropdown.Item className={cn('dropdown-item', className)} {...props} />;
}
export function DropdownMenuSeparator() {
  return <Dropdown.Separator className="dropdown-separator" />;
}
