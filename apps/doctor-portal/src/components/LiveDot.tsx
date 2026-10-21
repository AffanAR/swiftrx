/**
 * Pulsing dot used across the portal to signal "live" status.
 */
export function LiveDot({
  className,
  color = 'bg-rx-accent',
}: {
  className?: string;
  color?: string;
}) {
  return (
    <span className={`relative inline-flex items-center justify-center ${className ?? ''}`}>
      <span
        className={`absolute inline-flex h-full w-full rounded-full opacity-60 animate-breathe ${color}`}
        aria-hidden
      />
      <span className={`relative inline-flex h-2 w-2 rounded-full ${color}`} />
    </span>
  );
}
