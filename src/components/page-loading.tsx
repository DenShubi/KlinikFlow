export function PageLoading() {
  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-10 sm:px-6" aria-busy="true">
      <div className="h-7 w-48 animate-pulse rounded-full bg-surface motion-reduce:animate-none" />
      <p className="sr-only">Memuat…</p>
    </main>
  );
}
