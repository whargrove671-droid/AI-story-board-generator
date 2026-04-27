import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center rounded-none border px-2.5 py-0.5 text-xs font-mono font-bold uppercase tracking-wider transition-colors focus:outline-none focus:ring-1 focus:ring-cyan-500 focus:ring-offset-0',
  {
    variants: {
      variant: {
        default:
          'bg-cyan-500/20 text-cyan-400 border-cyan-500 shadow-[0_0_10px_rgba(6,182,212,0.3)] hover:bg-cyan-500/40',
        secondary:
          'bg-cyan-950/50 text-cyan-300 border-cyan-900 hover:bg-cyan-900/50',
        destructive:
          'bg-red-500/20 text-red-400 border-red-500 shadow-[0_0_10px_rgba(239,68,68,0.3)] hover:bg-red-500/40',
        outline: 'text-cyan-400 border-cyan-500/50 hover:bg-cyan-950/30',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge, badgeVariants };
