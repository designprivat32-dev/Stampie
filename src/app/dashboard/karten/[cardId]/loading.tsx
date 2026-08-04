export default function Loading() {
  return (
    <div className="flex min-h-dvh flex-col bg-canvas">
      <div className="border-b border-line bg-surface px-4 py-3">
        <div className="h-4 w-40 animate-pulse rounded bg-surface-2" />
        <div className="mt-1.5 h-3 w-24 animate-pulse rounded bg-surface-2" />
      </div>

      <div className="flex flex-1 flex-col lg:flex-row">
        <div className="w-full space-y-4 border-line bg-surface p-5 lg:w-[420px] lg:border-r">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="space-y-2">
              <div className="h-3 w-24 animate-pulse rounded bg-surface-2" />
              <div className="h-9 w-full animate-pulse rounded-md bg-surface-2" />
            </div>
          ))}
        </div>

        <div className="hidden flex-1 items-center justify-center p-8 lg:flex">
          <div className="h-[420px] w-[336px] animate-pulse rounded-xl bg-surface-2" />
        </div>
      </div>
    </div>
  )
}
