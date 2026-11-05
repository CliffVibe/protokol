// Заглушка T01: проверяем, что приложение живёт на проде. Лента «Сейчас» — в T05.
export default function HomePage() {
  return (
    <main className="mx-auto flex max-w-[1120px] flex-col gap-4 px-4 py-12 md:px-6">
      {/* Размеры в rem — чтобы заголовок рос вместе с текстом при масштабе 200% */}
      <h1 className="font-heading text-[1.75rem] leading-tight font-bold md:text-[2.25rem]">
        Протокол
      </h1>
      <p className="max-w-prose text-base text-ink-muted">
        Цифровой деканат: расписание, успеваемость, справки и&nbsp;уведомления&nbsp;— в&nbsp;одном
        месте и&nbsp;в&nbsp;нужный момент. Скоро здесь появится личный кабинет.
      </p>
    </main>
  );
}
