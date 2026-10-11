/** Placeholder shown by loading.tsx while a signed-in page loads its data. */
export default function PageSkeleton({ label = "Loading" }: { label?: string }) {
  return (
    <div className="skeletonPage" role="status" aria-live="polite" aria-busy="true">
      <span className="srOnly">{label}…</span>
      <div className="skeletonLine skeletonTitle" />
      <div className="skeletonLine w-[60%]" />
      <div className="skeletonGrid">
        <div className="skeletonCard" />
        <div className="skeletonCard" />
        <div className="skeletonCard" />
      </div>
    </div>
  );
}
