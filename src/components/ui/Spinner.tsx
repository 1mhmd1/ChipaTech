// Tiny inline spinner used inside buttons, banners, etc.
// Picks up `currentColor` so it tints itself to match the surrounding
// text color — works on both dark and light backgrounds.
export function Spinner({
  className = 'h-4 w-4',
}: {
  className?: string;
}) {
  return (
    <span
      className={`inline-block ${className} animate-spin rounded-full border-2 border-current border-t-transparent align-[-2px]`}
      role="status"
      aria-label="Loading"
    />
  );
}
