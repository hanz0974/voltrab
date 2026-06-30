import { CATEGORY_COLORS } from '../data';
import type { PartCategory } from '../types';

interface CategoryBadgeProps {
  category: PartCategory;
  size?: 'sm' | 'md';
}

export function CategoryBadge({ category, size = 'md' }: CategoryBadgeProps) {
  const colors = CATEGORY_COLORS[category];
  return (
    <span
      className={`chip ${colors.bg} ${colors.text} ${size === 'sm' ? 'px-2 py-0.5 text-[11px]' : ''}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${colors.dot}`} />
      {category}
    </span>
  );
}
