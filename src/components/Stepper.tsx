import { Check } from 'lucide-react';
import type { StepId } from '../types';

interface StepperProps {
  current: StepId;
  completed: Set<StepId>;
  onStepClick?: (step: StepId) => void;
}

const STEPS: { id: StepId; label: string; short: string }[] = [
  { id: 'project', label: 'Informasi Project', short: 'Project' },
  { id: 'components', label: 'Komponen', short: 'Komponen' },
  { id: 'summary', label: 'Ringkasan RAB', short: 'RAB' },
];

export function Stepper({ current, completed, onStepClick }: StepperProps) {
  const currentIndex = STEPS.findIndex((s) => s.id === current);

  return (
    <div className="w-full">
      <div className="flex items-center justify-between gap-1 sm:gap-2">
        {STEPS.map((step, idx) => {
          const isCompleted = completed.has(step.id);
          const isCurrent = step.id === current;
          const isPast = idx < currentIndex;
          const isSummary = step.id === 'summary';
          const isComponents = step.id === 'components';
          const reachable = isCompleted || isCurrent || isPast || isSummary || isComponents;

          return (
            <div key={step.id} className="flex flex-1 items-center">
              <button
                type="button"
                disabled={!reachable}
                onClick={() => reachable && onStepClick?.(step.id)}
                className={`group flex flex-col items-center gap-1.5 sm:flex-row sm:gap-2.5 ${
                  reachable ? 'cursor-pointer' : 'cursor-not-allowed'
                }`}
              >
                <span
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 text-sm font-semibold transition-all duration-300 ${
                    isCurrent
                      ? 'border-brand-600 bg-brand-600 text-white shadow-glow scale-110'
                      : isCompleted || isPast
                        ? 'border-brand-600 bg-brand-50 text-brand-700'
                        : 'border-slate-200 bg-white text-slate-400'
                  }`}
                >
                  {isCompleted || isPast ? (
                    <Check className="h-4 w-4" strokeWidth={3} />
                  ) : (
                    idx + 1
                  )}
                </span>
                <span
                  className={`hidden text-sm font-medium sm:block ${
                    isCurrent ? 'text-brand-700' : isCompleted || isPast ? 'text-slate-700' : 'text-slate-400'
                  }`}
                >
                  {step.label}
                </span>
                <span
                  className={`text-xs font-medium sm:hidden ${
                    isCurrent ? 'text-brand-700' : isCompleted || isPast ? 'text-slate-600' : 'text-slate-400'
                  }`}
                >
                  {step.short}
                </span>
              </button>
              {idx < STEPS.length - 1 && (
                <div
                  className={`mx-1 h-0.5 flex-1 rounded-full transition-all duration-500 sm:mx-2 ${
                    idx < currentIndex ? 'bg-brand-500' : 'bg-slate-200'
                  }`}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
