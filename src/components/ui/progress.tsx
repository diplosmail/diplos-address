interface ProgressProps {
  value: number;
  max: number;
  className?: string;
}

export function Progress({ value, max, className = '' }: ProgressProps) {
  const percent = max > 0 ? Math.round((value / max) * 100) : 0;

  return (
    <div className={`w-full ${className}`}>
      <div className="flex justify-between text-sm text-muted mb-1">
        <span>{value} / {max}</span>
        <span>{percent}%</span>
      </div>
      <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
        <div
          className="h-full rounded-full bg-primary transition-all duration-300"
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}
