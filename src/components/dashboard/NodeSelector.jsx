import React from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  DASHBOARD_VIEW_ALL,
  EXPECTED_SENSOR_NODES,
  getNodeLabel,
} from '@/config/greenhouse';

const VIEW_OPTIONS = [
  { id: DASHBOARD_VIEW_ALL, label: 'Tất cả' },
  ...EXPECTED_SENSOR_NODES.map((nodeId) => ({
    id: nodeId,
    label: getNodeLabel(nodeId),
  })),
];

export default function NodeSelector({ value, onChange, className }) {
  return (
    <div className={cn('inline-flex rounded-lg border bg-muted/40 p-1', className)}>
      {VIEW_OPTIONS.map((option) => {
        const active = value === option.id;
        return (
          <Button
            key={option.id}
            type="button"
            size="sm"
            variant={active ? 'default' : 'ghost'}
            className={cn('h-8 px-4', !active && 'text-muted-foreground')}
            onClick={() => onChange(option.id)}
          >
            {option.label}
          </Button>
        );
      })}
    </div>
  );
}
