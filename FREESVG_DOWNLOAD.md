# FreeSVG.org - Прямое скачивание SVG

## Исследование

Изучены возможности получения прямой ссылки на скачивание SVG с сайта https://freesvg.org

## Найденные варианты

### 1. `/download/{id}` с заголовком Referer (РАБОТАЕТ!)

**Решение:** Добавить заголовок `Referer: https://freesvg.org/` к запросу на `/download/{id}`

```bash
curl -H "Referer: https://freesvg.org/" "https://freesvg.org/download/95440"
```

**Результат:** Возвращается SVG файл с `Content-Type: image/svg+xml`

**Важно:**
- Без заголовка `Referer` возвращается пустой ответ
- ID можно найти в HTML страницы в ссылке `/download/{id}`

---

### 2. Официальный API (требует регистрации)

**Эндпоинты:**
- `POST https://freesvg.org/api/v1/auth/login` - получение токена
- `GET https://freesvg.org/api/v1/svg/{id}` - получение данных SVG
- `GET https://freesvg.org/api/v1/svgs` - список SVG (25 шт)
- `GET https://freesvg.org/api/v1/search?query=term` - поиск

**Недостаток:** Требуется регистрация и Bearer токен

Документация: https://freesvg.org/pages/api-and-usage

---

### 3. Прямые пути к файлам (НЕ РАБОТАЕТ)

Проверены следующие пути - все возвращают 404:
- `/storage/svg/{filename}.svg`
- `/storage/uploads/{filename}.svg`
- `/storage/{id}.svg`
- `/img/{filename}.svg`
- `/svg/{id}`

**Вывод:** SVG файлы не хранятся в публично доступных директориях

---

### 4. PNG конвертация

**Эндпоинты:**
- `/converts/{id}/2400` - PNG 2400px
- `/converts/{id}/300` - PNG 300px

**Пример:** `https://freesvg.org/converts/95440/2400`

---

## Реализация

### Серверный прокси (ИСПОЛЬЗУЕТСЯ)

Браузер не устанавливает Referer при открытии ссылки в новой вкладке, поэтому прямые ссылки не работают.

**Решение:** Создан API endpoint `/api/download-freesvg?id={id}` который:
1. Получает ID SVG
2. Делает запрос к freesvg.org с заголовком `Referer: https://freesvg.org/`
3. Возвращает SVG файл с `Content-Disposition: attachment`

```typescript
// app/api/download-freesvg/route.ts
const response = await fetch(`https://freesvg.org/download/${id}`, {
  headers: {
    'Referer': 'https://freesvg.org/',
  },
});
```

### Почему прямые ссылки не работают

Открытие `https://freesvg.org/download/95440` в новой вкладке:
- Браузер НЕ отправляет Referer заголовок
- Сервер freesvg.org возвращает пустой ответ
- Скачивание не происходит

---

## Как получить ID

ID можно извлечь из HTML страницы:
```html
<a href="/download/95440" class="btn btn-warning">Download SVG</a>
```

Паттерн: `/download/(\d+)`

---

## Лицензия

Все SVG на freesvg.org распространяются под лицензией CC0 (Public Domain).
Можно использовать бесплатно для любых целей без указания авторства.

---

## Источники

- [FreeSVG.org](https://freesvg.org/)
- [API Documentation](https://freesvg.org/pages/api-and-usage)
