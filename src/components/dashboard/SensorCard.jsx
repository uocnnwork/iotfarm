import React from 'react';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';

export default function SensorCard({ icon: Icon, label, value, unit, color, warning }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
    >
      <Card className={cn(
        "relative overflow-hidden p-5 shadow-sm hover:shadow-md transition-shadow duration-300",
        warning
          ? "border border-red-400 bg-red-50/40 dark:bg-red-900/20 dark:border-red-600/50"
          : "border border-transparent",
      )}>
        <div className="flex items-start justify-between">
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{label}</p>
            <div className="flex items-baseline gap-1.5">
              <span className="text-3xl font-bold tracking-tight">{value ?? '--'}</span>
              <span className="text-sm font-medium text-muted-foreground">{unit}</span>
            </div>
          </div>
          <div className={cn(
            "w-11 h-11 rounded-xl flex items-center justify-center",
            color
          )}>
            <Icon className="w-5 h-5" />
          </div>
        </div>
        {warning && (
          <div className="mt-3 text-xs font-medium text-destructive flex items-center gap-1.5">
            <div className="w-1.5 h-1.5 rounded-full bg-destructive animate-pulse" />
            {warning}
          </div>
        )}
        <div className={cn(
          "absolute bottom-0 left-0 right-0 h-1 opacity-40",
          color
        )} />
      </Card>
    </motion.div>
  );
}