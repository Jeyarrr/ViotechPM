import { cn } from '@/lib/utils';

export function Brand({ compact = false, className }: { compact?: boolean; className?: string }) {
  return (
    <div className={cn('brand', compact && 'brand-compact', className)}>
      <img
        src="/assets/viotech-transparent.png"
        alt="Viotech I.T. Solutions"
        width={56}
        height={56}
      />
      {!compact && (
        <div>
          <span className="brand-name">
            Viotech<span>PM</span>
          </span>
          <span className="brand-caption">PROJECT WORKSPACE</span>
        </div>
      )}
    </div>
  );
}
