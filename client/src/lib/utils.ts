import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
export function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();
}
export function currency(value: number, code = 'PHP') {
  return new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: code,
    maximumFractionDigits: 0,
  }).format(value);
}
