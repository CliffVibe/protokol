// Первая цель Tab на каждой странице: прыжок мимо навигации к содержимому (#main).
export function SkipLink() {
  return (
    <a
      href="#main"
      className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:inline-flex focus:min-h-11 focus:items-center focus:rounded-lg focus:bg-surface focus:px-4 focus:text-base focus:font-medium focus:text-brand focus:shadow-md"
    >
      Перейти к содержимому
    </a>
  );
}
