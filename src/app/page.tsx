// Заглушка T01: проверяем, что приложение живёт на проде. Лента «Сейчас» — в T05.
export default function HomePage() {
  return (
    <main className="mx-auto flex max-w-[1120px] flex-col gap-4 px-4 py-12 md:px-6">
      <h1 className="font-heading text-[28px] leading-tight font-bold md:text-[36px]">Протокол</h1>
      <p className="max-w-prose text-base text-ink-muted">
        Цифровой деканат: расписание, успеваемость, справки и уведомления — в одном месте и в нужный
        момент. Скоро здесь появится личный кабинет.
      </p>
    </main>
  );
}
