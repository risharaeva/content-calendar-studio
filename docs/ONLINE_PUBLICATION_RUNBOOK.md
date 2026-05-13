# Online Publication Runbook

Подробная инструкция, как повторить публикацию внутреннего приложения онлайн для команды: GitHub + Supabase + Vercel.

Эта инструкция написана по следам запуска `content-calendar-studio` и включает ошибки, которые реально возникали во время настройки.

## Главная Логика

Есть две разные части системы.

**Код приложения**

- интерфейс;
- кнопки;
- логика генерации;
- дизайн;
- API-роуты;
- Prisma-схема.

Код живет в GitHub. Когда Codex или разработчик меняет код, изменения коммитятся и пушатся в GitHub. Vercel видит пуш в `main` и автоматически деплоит новую версию сайта.

**Рабочие данные**

- Inputs;
- Inspiration;
- Brand Profile;
- Visual References;
- Content Calendar;
- Published Posts;
- Analytics;
- Recommendations.

Данные живут в Supabase Postgres. Они не проходят через GitHub и не ждут деплоя Vercel.

Если сотрудник добавил Inspiration-пост и нажал `Add inspiration`, запись должна сразу сохраниться в Supabase. Другие сотрудники увидят ее после обновления страницы или после действия, которое заново подтягивает dashboard state.

## Что Нужно Подготовить

Аккаунты:

- GitHub;
- Vercel;
- Supabase.

Локально на компьютере разработчика:

- Node.js;
- npm;
- Git;
- проект в локальной папке;
- доступ к GitHub-репозиторию.

Для приложения:

- `.env.example`;
- Prisma schema;
- команда `npm run build`;
- команда `npm run db:push`;
- команда `npm run db:seed`, если нужны стартовые данные.

## Рекомендуемая Архитектура

```text
GitHub repository
  -> Vercel deployment
      -> Supabase Postgres
          -> all shared team data
```

Vercel отвечает за сайт. Supabase отвечает за общую базу данных. GitHub отвечает за историю кода.

## Шаг 1. Подготовить Репозиторий

1. Проверь, что проект запускается локально.
2. Проверь, что сборка проходит:

```bash
npm run lint
npm run test
npm run build
```

3. Проверь, что в Git не попадут лишние файлы:

```bash
git status -sb
```

Не добавляй:

- `.env`;
- пароли;
- локальные ассеты;
- временные файлы;
- случайные копии вроде `page 2.tsx`;
- большие папки с изображениями;
- `node_modules`;
- `.next`.

4. Создай GitHub-репозиторий.

Для внутреннего продукта лучше private, для MVP без секретов можно public. Если репозиторий public, особенно внимательно проверь, что в коде нет приватных материалов и ключей.

5. Запушь проект:

```bash
git add .
git commit -m "Initial deployable app"
git branch -M main
git remote add origin https://github.com/USER/REPO.git
git push -u origin main
```

## Шаг 2. Создать Supabase Project

1. Создай новый Supabase project.
2. Сохрани database password в безопасном месте.
3. Открой раздел подключения к базе.
4. Для Prisma нужны два URL:

```env
DATABASE_URL="..."
DIRECT_URL="..."
```

### DATABASE_URL

Для Vercel/serverless используй **Transaction Pooler** / **Shared Pooler**.

Обычно это строка вида:

```env
postgresql://postgres.PROJECT_REF:YOUR_PASSWORD@aws-...pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=1
```

Важные признаки:

- host содержит `pooler.supabase.com`;
- port обычно `6543`;
- в конце добавлено `?pgbouncer=true&connection_limit=1`;
- это одна полная URI-строка, не отдельные host/port/user поля.

Transaction Pooler важен, потому что Vercel работает как serverless/auto-scaling среда. Supabase тоже указывает использовать transaction mode для таких окружений.

### DIRECT_URL

`DIRECT_URL` нужен Prisma для schema updates/migrations.

Можно использовать:

- Direct connection, если работает с твоей сети;
- Session Pooler, если Direct ругается на IPv6 или недоступен.

Пример:

```env
postgresql://postgres:YOUR_PASSWORD@db.PROJECT_REF.supabase.co:5432/postgres
```

или session pooler:

```env
postgresql://postgres.PROJECT_REF:YOUR_PASSWORD@aws-...pooler.supabase.com:5432/postgres
```

Не создавай `DIRECT_URL1`, `DIRECT_URL_2` и похожие переменные. Prisma читает именно `DIRECT_URL`.

### Если Пароль Содержит Спецсимволы

Если пароль содержит символы вроде:

```text
@ : / ? # & %
```

его может понадобиться URL-encode. Самый простой путь: использовать пароль без спецсимволов или скопировать готовую строку из Supabase и заменить только `[YOUR-PASSWORD]`.

## Шаг 3. Настроить Vercel Project

1. В Vercel нажми `Add New Project`.
2. Выбери GitHub-репозиторий.
3. Framework обычно определяется автоматически как Next.js.
4. Build command обычно:

```bash
npm run build
```

5. Deploy можно запустить сразу, но если env vars еще не заданы, сайт может упасть. Это нормально: после env vars нужно сделать redeploy.

## Шаг 4. Environment Variables В Vercel

Открой:

```text
Project Settings -> Environment Variables
```

Добавь:

```env
DATABASE_URL="transaction pooler URI"
DIRECT_URL="direct or session pooler URI"
APP_ACCESS_PASSWORD="password-for-team"
AUTH_SECRET="long-random-string"
```

Опционально:

```env
OPENAI_API_KEY=""
ANTHROPIC_API_KEY=""
```

### Какие Environment Выбирать

Для рабочего сайта выбери:

```text
Production and Preview
```

Этого достаточно для сайта, который открывают сотрудники.

`Development` в Vercel нужен только если ты используешь Vercel CLI и хочешь подтягивать переменные локально через `vercel env pull`. Если ты работаешь локально через свой `.env`, Development можно не заполнять.

### Почему После Сохранения Значение Пустое

Это нормально. Vercel скрывает sensitive-переменные после сохранения.

Когда ты открываешь переменную снова, поле может выглядеть так, будто ты вводишь ее заново. Это не значит, что значение пропало. Это защита секретов.

Если нужно заменить значение, вставь новое и сохрани. Если просто проверить, что переменная есть, смотри список переменных, а не содержимое.

### После Изменения Env Vars Нужен Redeploy

Изменения environment variables не применяются к уже созданному deployment. Нужно сделать новый deploy/redeploy.

В Vercel:

```text
Deployments -> нужный deployment -> Redeploy
```

Или просто сделать новый push в `main`.

## Шаг 5. Подготовить Базу

После того как `DATABASE_URL` и `DIRECT_URL` готовы, нужно применить Prisma schema.

Локально:

```bash
npm install
npm run prisma:generate
npm run db:push
npm run db:seed
```

Если проект уже развернут на Vercel, но таблицы еще не созданы, сайт может открываться пустым или падать. Это нормально до `db:push`.

## Шаг 6. Проверить Сайт

Открой production URL:

```text
https://PROJECT.vercel.app
```

Если стоит `APP_ACCESS_PASSWORD`, сначала откроется login page.

Проверь:

- пароль открывает workspace;
- Inputs сохраняются;
- Inspiration добавляется и остается после reload;
- Content Calendar видит данные из Supabase;
- Analytics открывается;
- после добавления записи на одном компьютере другой компьютер видит ее после refresh.

## Что Нормально После Переноса В Облако

### Локальные Данные Не Переносятся Автоматически

Если до этого приложение работало локально на SQLite или на другом `.env`, данные не появятся в Supabase сами.

В облаке будет новая база.

Нужно отдельно решить, что переносить:

- Brand Profile;
- Visual Identity;
- стартовые Goals;
- Inspiration;
- Content Calendar;
- Published History.

В нашем случае мы решили:

- Brand Profile перенести;
- Content Calendar перегенерировать;
- Post packets не переносить;
- Published history не переносить, потому что ее еще не было;
- локальные пути не переносить, заменить внешними ссылками.

### Visual References Лучше Делать Внешними Ссылками

Локальный путь вроде:

```text
/Users/name/Documents/...
```

работает только на одном компьютере.

Для команды лучше использовать:

- Google Drive;
- Yandex Disk;
- Shopify CDN;
- Notion;
- Pinterest/social links;
- Supabase Storage;
- любой публичный/командный URL.

## Как Работают Обновления После Запуска

### Если Меняется Код

1. Codex/разработчик правит код локально.
2. Прогоняет:

```bash
npm run lint
npm run test
npm run build
```

3. Делает commit.
4. Пушит в GitHub.
5. Vercel автоматически деплоит новую версию.
6. Сотрудники увидят новый интерфейс после обновления страницы.

### Если Меняются Данные

Сотрудник работает в браузере:

1. Заполнил форму.
2. Нажал save/add/generate.
3. Данные ушли в Supabase.
4. Другие сотрудники увидят их после refresh или следующего server reload.

Данные не проходят через GitHub и не ждут Vercel deploy.

### Что Может Потеряться

Может потеряться только несохраненный текст в форме, если:

- человек печатал, но не нажал save;
- в этот момент был redeploy;
- страница обновилась.

Сохраненные записи в Supabase деплой не стирает.

## Частые Ошибки И Что Делать

### Ошибка: This page couldn't load

Что делать:

1. Открой Vercel project.
2. Перейди в `Logs`.
3. Найди красную строку `500`.
4. Открой конкретный request.
5. Скопируй полный текст ошибки.

Без полного текста ошибки сложно понять причину. В списке логов часто видна только первая строка.

### Ошибка: PrismaClientInitializationError

Обычно проблема в `DATABASE_URL`.

Проверь:

- переменная называется ровно `DATABASE_URL`;
- это полная URI-строка;
- пароль вставлен вместо `[YOUR-PASSWORD]`;
- нет лишних квадратных скобок;
- выбран Production/Preview environment;
- после изменения env vars сделан redeploy;
- для Vercel используется transaction pooler, а не direct IPv6-only URL.

### Ошибка: Not IPv4 Compatible

Supabase direct connection может быть IPv6-only. Vercel или твоя локальная сеть могут не уметь ходить туда напрямую.

Решение:

- для `DATABASE_URL` использовать Transaction Pooler;
- для `DIRECT_URL`, если Direct не работает, использовать Session Pooler;
- не покупать IPv4 add-on на MVP, если pooler решает задачу.

### Ошибка: Создано DIRECT_URL И DIRECT_URL1

Нужно только:

```env
DATABASE_URL
DIRECT_URL
```

Если создать `DIRECT_URL1`, Prisma его не увидит.

Удалить лишнее, оставить правильное имя.

### Ошибка: Env Vars Вроде Есть, Но Сайт Их Не Видит

Проверь:

- переменные добавлены в правильный project;
- выбраны `Production and Preview`;
- после сохранения сделан redeploy;
- ты открываешь именно production URL, а не старый preview deployment;
- нет опечатки в имени переменной.

Важно: Vercel не применяет новые env vars к старым deployment автоматически.

### Ошибка: Пустая База После Деплоя

Это нормально, если Supabase новая.

GitHub переносит код, но не переносит локальные данные. Нужно:

```bash
npm run db:push
npm run db:seed
```

Или отдельно импортировать нужные рабочие данные.

### Ошибка: Transaction API Error / Transaction Not Found

Это может появляться, когда Prisma interactive transaction живет слишком долго через transaction pooler.

Решение в коде:

- не держать длинные interactive transactions;
- использовать короткие операции;
- использовать batch `$transaction([...])`, если возможно;
- не делать долгую генерацию текста внутри транзакции.

### Ошибка: Connection Pool Timeout / P2024

Пример:

```text
Timed out fetching a new connection from the connection pool
connection_limit: 1
```

Причина: приложение одновременно делает много Prisma-запросов, а pool limit очень маленький.

Что делать:

- оставить `connection_limit=1` для serverless как осторожный MVP-вариант;
- в коде избегать лишних параллельных запросов;
- не запускать много тяжелых действий одновременно;
- если проект вырос, пересмотреть pool size и архитектуру запросов.

### Ошибка: Cannot read properties of null

Обычно это не проблема Vercel, а проблема данных или старой формы:

- в базе есть запись с `null`, хотя код ждет строку;
- seed не создал нужное значение;
- приложение ожидает новый формат данных, а база старая.

Что делать:

1. Найти точный stack trace в Vercel logs.
2. Найти поле, которое `null`.
3. Добавить fallback в коде или мигрировать данные.
4. Сделать build и redeploy.

## Как Давать Доступ Сотрудникам

Минимальный MVP:

- отправить production URL;
- отправить `APP_ACCESS_PASSWORD` отдельным безопасным каналом;
- объяснить, что все работают в одной общей базе;
- объяснить, что refresh подтягивает новые данные.

Не отправлять:

- Supabase password;
- DATABASE_URL;
- DIRECT_URL;
- GitHub write access, если сотрудник не работает с кодом;
- Vercel owner access, если сотрудник только пользуется приложением.

## Что Делать При Новом Баге

1. Сотрудник описывает, что нажал.
2. Присылает URL страницы.
3. Присылает скриншот.
4. Если ошибка серверная, владелец проекта смотрит Vercel Logs.
5. Codex/разработчик чинит локально.
6. Прогоняет:

```bash
npm run lint
npm run test
npm run build
```

7. Пушит в GitHub.
8. Vercel деплоит.

## Мини-Чеклист Перед Следующим Запуском

- [ ] Проект работает локально.
- [ ] `npm run build` проходит.
- [ ] `.env` не попадает в Git.
- [ ] Репозиторий создан в GitHub.
- [ ] Supabase project создан.
- [ ] `DATABASE_URL` взят из Transaction Pooler.
- [ ] `DIRECT_URL` взят из Direct или Session Pooler.
- [ ] В Vercel добавлены `DATABASE_URL`, `DIRECT_URL`, `APP_ACCESS_PASSWORD`, `AUTH_SECRET`.
- [ ] Env vars стоят на Production and Preview.
- [ ] После env vars сделан redeploy.
- [ ] `npm run db:push` выполнен.
- [ ] `npm run db:seed` выполнен, если нужен starter data.
- [ ] Production URL открывается.
- [ ] Пароль открывает workspace.
- [ ] Тестовая запись сохраняется и видна после reload.

## Полезные Ссылки

- Vercel Environment Variables: https://vercel.com/docs/environment-variables
- Vercel Environments: https://vercel.com/docs/deployments/environments
- Supabase connection strings: https://supabase.com/docs/reference/postgres/connection-strings
- Supabase + Prisma guide: https://supabase.com/docs/guides/database/prisma
- Supabase Prisma troubleshooting: https://supabase.com/docs/guides/database/prisma/prisma-troubleshooting
- Prisma PgBouncer guide: https://www.prisma.io/docs/guides/performance-and-optimization/connection-management/configure-pg-bouncer
