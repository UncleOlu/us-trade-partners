export function Loading({ label = 'Loading' }: { label?: string }): JSX.Element {
  return (
    <div role="status" className="loading">
      {label}...
    </div>
  );
}
