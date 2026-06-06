import React from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const SEGMENTS = [
  { id: 'alerts', label: 'Cảnh báo' },
  { id: 'thresholds', label: 'Ngưỡng cảnh báo' },
];

export default function AlertsSegment({ value, onChange, className }) {
  return (
    <div className={cn('inline-flex rounded-lg border bg-muted/40 p-1', className)}>
      {SEGMENTS.map((segment) => {
        const active = value === segment.id;
        return (
          <Button
            key={segment.id}
            type="button"
            size="sm"
            variant={active ? 'default' : 'ghost'}
            className={cn('h-8 px-4', !active && 'text-muted-foreground')}
            onClick={() => onChange(segment.id)}
          >
            {segment.label}
          </Button>
        );
      })}
    </div>
  );
}
