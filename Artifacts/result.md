# Анализ проекта — ER Diagram Constructor

## Общее описание

Проект представляет собой **ER-диаграмм-конструктор** на базе Google Apps Script (GAS), работающий через Google Таблицы. Пользователь может создавать схемы баз данных, определять таблицы и колонки, строить FK-связи, визуализировать ER-диаграмму на Canvas, экспортировать/импортировать схемы в JSON, генерировать отдельные Google Таблицы из схем и управлять шаблонами.

**Технологии:**
- **Backend:** Google Apps Script (V8), данные хранятся в листах Google Spreadsheet
- **Frontend:** HTML + CSS + Vanilla JS, Canvas 2D рендеринг, served via `HtmlService`
- **API:** RPC-паттерн через `google.script.run` с batch-обработкой

---

## Текущая структура файлов

| Файл | Назначение | Строк (прибл.) |
|------|-----------|----------------|
| `appsscript.json` | Конфигурация GAS-проекта | 9 |
| `Backend.js` | Серверная логика: CRUD, API-диспетчер, seed, JSON экспорт/импорт, инструкции | ~1108 |
| `CreateTables.js` | Генерация Google Sheets из схем, анализ, экспорт в новую книгу | ~430 |
| `Frontend.html` | **Весь фронтенд в одном файле**: CSS (~500 строк) + JS (~2700 строк) | ~4106 |

---

## Проблемы архитектуры

### 1. 🔴 Frontend.html — монолитный файл (4106 строк)

**Проблема:** CSS, HTML и весь JavaScript (состояние, Canvas-рендеринг, API-вызовы, UI-логика, модальные окна, drag-and-drop, sync-очередь) находятся в одном файле. Это делает:
- Навигацию и поиск багов крайне затруднительными
- Риск конфликтов при одновременном редактировании
- Невозможным модульное тестирование отдельных частей

**Правильная организация для GAS-проекта:**

Google Apps Script поддерживает **множественные `.html` файлы** через `include()` паттерн. Рекомендуемая структура:

```
📁 Проект
├── appsscript.json
├── Backend.js              # Серверная часть (оставить)
├── CreateTables.js         # Генерация листов (оставить)
│
├── Frontend.html           # Точка входа — только <!DOCTYPE html> + <?!= include(...) ?>
├── Styles.html             # Все <style>...</style>
├── JsState.html            # Состояние, sync-очередь, API-обёртки
├── JsCanvas.html           # Canvas-рендеринг, hit-testing, zoom/pan
├── JsUI.html              # Модальные окна, формы, обработчики
├── JsSchema.html           # Логика схем (создание, копирование, удаление)
├── JsTable.html            # Логика таблиц (создание, редактирование, колонки)
├── JsTemplates.html        # Управление шаблонами
├── JsBuilder.html          # Листы/Builder UI
├── JsDicts.html            # Справочники UI
├── JsJson.html             # JSON экспорт/импорт UI
└── JsUtils.html            # Утилиты: toast, theme, sync badge
```

**Важно:** GAS **не поддерживает** отдельные `.js` файлы для фронтенда. Все JS должно быть внутри `<script>` тегов `.html` файлов. Но разбивка на несколько `.html` файлов позволяет организовать код логически.

Механизм подключения в `Frontend.html`:
```html
<?!= HtmlService.createHtmlOutputFromFile('Styles').getContent() ?>
<?!= HtmlService.createHtmlOutputFromFile('JsState').getContent() ?>
<?!= HtmlService.createHtmlOutputFromFile('JsCanvas').getContent() ?>
...
```

---

### 2. 🔴 Backend.js — перегруженный файл (~1108 строк)

**Проблемы:**
- Один файл содержит: инициализацию, CRUD для 8+ сущностей, JSON экспорт/импорт, batch-обработку, seed-данные, диспетчер запросов
- Дублирующиеся handler-записи в `processRequest` (например, `getColumnTypes` объявлен дважды — строки ~248 и ~287)
- Смешаны разные уровни абстракции: общие утилиты (`_allRows`, `_nextId`) и специфичная бизнес-логика

**Рекомендуемая структура бэкенда:**

GAS поддерживает несколько `.js` файлов — они все компилируются в один контекст. Рекомендуемое разделение:

```
Backend.js           # Точка входа: doGet(), processRequest(), initSheets()
Utils.gs             # Общие утилиты: _sheet(), _allRows(), _nextId(), _appendRow(), _updateRow(), _deleteRow(), _batchDeleteWhere()
Sheets/
├── Schemas.gs       # CRUD схем + copySchema, detachSchema
├── Tables.gs        # CRUD таблиц + copyTable, createTableWithTemplate
├── Columns.gs       # CRUD колонок + reorderColumns
├── Relations.gs     # createRelation, deleteRelation
├── Categories.gs    # CRUD категорий
├── Assignments.gs   # CRUD назначений
├── ColumnTypes.gs   # CRUD типов колонок
├── Templates.gs     # CRUD шаблонов + applyTemplate, getTemplatesForCategory
└── Instructions.gs  # getInstruction, saveInstruction
Seed.gs              # _seedDefaults(), _seedDefaultTemplates()
Batch.gs             # processBatch(), loadAllData()
JsonExport.gs        # exportSchemaJson(), importSchemaJson()
SystemDump.gs        # getSystemDump()
CreateTables.js      # Уже существует — оставить как есть
```

---

### 3. 🟡 Неправильное расширение файлов

Файлы с серверным кодом GAS имеют расширение **`.gs`** (Google Script), но в проекте они названы **`.js`**:
- `Backend.js` → должен быть `Backend.gs`
- `CreateTables.js` → должен быть `CreateTables.gs`

Хотя GAS может работать с `.js`, стандартная конвенция — `.gs` для серверного кода, чтобы отличать от клиентского JS.

---

### 4. 🟡 appsscript.json — странная часовая зона

```json
"timeZone": "Asia/Dhaka"
```

Для русскоязычного проекта логичнее использовать `"Europe/Moscow"`.

---

## Найденные баги и проблемы

### 🐛 Баг 1: Дублирующийся handler в processRequest

В `Backend.js` строки ~248 и ~287 дважды объявлен `getColumnTypes`:
```js
getColumnTypes:  () => _allRows(SHEETS.COL_TYPES),   // строка ~248
// ...
getColumnTypes:  () => _allRows(SHEETS.COL_TYPES),   // строка ~287 — дубликат!
```

Это не вызывает ошибку (второе объявление перезаписывает первое), но это мёртвый код и признак копипасты.

### 🐛 Баг 2: Обозначения категорий/назначений могут быть пустыми строками

В `createCategoryItem` и `createAssignmentItem` нет проверки на пустое имя:
```js
function createCategoryItem(p) {
  const now = new Date().toISOString();
  if (!p.name) throw new Error('Название обязательно');  // ✓ Проверка есть
  // ...
}
```
Но в `createAssignment` (строка ~476) используется `CAT_HEADERS` вместо `ASG_HEADERS`:
```js
function createAssignment(p) {
  // ...
  return _appendRow(SHEETS.ASSIGNMENTS, obj, CAT_HEADERS);  // ← БАГ! Должно быть ASG_HEADERS
}
```
`CAT_HEADERS` = `['id','name','description','create_date_time','update_date_time']` — совпадает по структуре с assignments, но это семантическая ошибка и сломает если заголовки изменятся.

### 🐛 Баг 3: `createAssignment` использует неправильный массив заголовков

См. выше — `CAT_HEADERS` вместо собственных `ASG_HEADERS`. Нужно либо определить `const ASG_HEADERS = ['id','name','description','create_date_time','update_date_time']`, либо использовать `CAT_HEADERS` явно.

### 🐛 Баг 4: Потенциальная гонка при `_nextId`

Функция `_nextId` читает максимальный ID из листа. Если два пользователя одновременно создают записи, они могут получить одинаковый ID. В контексте GAS (однопоточная среда) это менее критично, но при batch-импорте (`importSchemaJson`) ID рассчитывается в памяти, что может конфликтовать с `_nextId`.

### 🐛 Баг 5: Sync-очередь может потерять данные при ошибке

В `flushSync()` при ошибке запросы возвращаются в очередь:
```js
batch.forEach(b=>SQ.push(b));
```
Но после 3-х попыток все отклоняются (`batch.forEach(b=>b.reject&&b.reject(e))`). Пользователь не узнает, какие данные не сохранились. Нет механизма восстановления.

### 🐛 Баг 6: `_updateRow` перезаписывает все колонки

`_updateRow` читает существующую строку, merge-ит обновления, и **перезаписывает всю строку целиком**:
```js
sh.getRange(realRow, 1, 1, headers.length).setValues([headers.map(h => merged[h] !== undefined ? merged[h] : '')]);
```
Если заголовки изменились или в листе есть дополнительные колонки (например, пользовательские), они будут затёрты.

### 🐛 Баг 7: Column cache (CC) инвалидируется не полностью

Функция `inv(tid)` инвалидирует кэш только для одной таблицы. Но при операциях, затрагивающих несколько таблиц (copySchema, importSchemaJson), кэш не инвалидируется глобально, что может привести к отображению устаревших данных.

### 🐛 Баг 8: Обработка boolean-значений из Google Sheets

Google Sheets возвращает boolean из `getValues()`, но при чтении через `_allRows` данные сериализуются/десериализуются. Сравнение `c.is_pk === true` может не работать, если значение пришло как строка `'true'` или `'TRUE'`. Код частично обрабатывает это:
```js
function isPK(c){return c.is_pk===true||c.is_pk==='true'||c.is_pk==='TRUE';}
```
Но не везде — в `applyTemplate` и `createRelation` проверка может не сработать.

### 🟡 Проблема 9: Нет валидации FK-связей

При создании FK-колонки нет проверки, что `fk_table_id` и `fk_column_id` указывают на существующие таблицу и колонку. Можно создать битую связь.

### 🟡 Проблема 10: Удаление схемы не проверяет связи между схемами

`deleteSchema` каскадно удаляет таблицы и колонки только одной схемы. Если есть FK-связи между таблицами разных схем, они останутся "висячими".

### 🟡 Проблема 11: `exportToNewSpreadsheet` может упасть на больших схемах

Google Apps Script имеет лимиты:
- Максимальное время выполнения: 6 минут (360 секунд)
- Максимальный размер response: 50MB

Для схем с 50+ таблицами и сотнями колонок экспорт может превысить лимит времени.

---

## Рекомендации по правильной архитектуре

### Backend (серверная часть)

```
📁 Сервер
│
├── Backend.gs           # doGet(), processRequest() — только роутинг
├── Init.gs              # initSheets(), _seedDefaults()
├── Utils.gs             # _sheet(), _allRows(), _nextId(), _appendRow(), _updateRow(), _deleteRow(), _batchDeleteWhere()
│
├── 📁 api/              # Обработчики действий
│   ├── SchemasApi.gs    # create/update/delete/copy/detach/load
│   ├── TablesApi.gs     # CRUD таблиц + copy + createWithTemplate
│   ├── ColumnsApi.gs    # CRUD колонок + reorder
│   ├── RelationsApi.gs  # create/delete relations
│   ├── TemplatesApi.gs  # CRUD шаблонов + apply
│   ├── SystemApi.gs     # Categories, Assignments, ColumnTypes CRUD
│   ├── JsonApi.gs       # export/import JSON
│   └── BuilderApi.gs    # createSchemaTables, analyseSchema, exportToNewSpreadsheet
│
└── 📁 domain/           # Бизнес-логика, не зависящая от Sheets
    ├── SchemaService.gs    # Логика работы со схемами
    ├── TableService.gs     # Логика таблиц
    └── TemplateService.gs  # Логика шаблонов
```

**Принципы:**
1. **Диспетчер (processRequest)** — только маршрутизация, без бизнес-логики
2. **API-слой** — тонкие обработчики, принимающие payload, вызывающие сервисы
3. **Сервисный слой** — бизнес-логика, работающая с абстрактным хранилищем
4. **Утилиты** — общие функции для работы с Sheets

### Frontend (клиентская часть)

```
Frontend.html          # <!DOCTYPE html> + <?!= include(...) ?>
Styles.html            # Все CSS
Scripts/
├── Core.html          # Состояние (S), константы, тема
├── Sync.html          # Sync-очередь, flushSync, setSyncState
├── API.html           # api(), apiBatch(), apiAll()
├── Canvas.html        # render(), drawGrid(), drawTable(), drawRels(), hit-testing
├── CanvasEvents.html  # onDown(), onMove(), onUp(), onWheel(), onCtx(), onDbl()
├── UI.html            # Модальные окна, toast, sidebar, tabs
├── SchemaUI.html      # Дерево схем, контекстное меню схем
├── TableUI.html       # Создание/редактирование таблиц, колонки
├── ColumnEditor.html  # Редактор колонок, FK-селекторы
├── TemplatesUI.html   # Управление шаблонами
├── BuilderUI.html     # UI построителя листов
├── DictsUI.html       # UI справочников
├── JsonUI.html        # UI экспорта/импорта JSON
├── RelationsUI.html   # Popup связей, редактирование
├── MiniMap.html       # Миникарта
└── Utils.html         # setTheme(), toast(), confirm(), formatDate()
```

### Общая архитектура

```
┌─────────────────────────────────────────────────────┐
│                    Frontend (HTML/JS)                │
│  ┌──────────┐  ┌──────────┐  ┌──────────────────┐   │
│  │  Canvas  │  │  Sidebar │  │  Right Panel     │   │
│  │ Renderer │  │  (Tree)  │  │  Props/Cols/Rel  │   │
│  └────┬─────┘  └────┬─────┘  └────────┬─────────┘   │
│       │              │                 │              │
│       └──────────────┴─────────────────┘              │
│                         │                             │
│                  ┌──────▼──────┐                      │
│                  │  Sync Queue │ (debounced batch)    │
│                  └──────┬──────┘                      │
└─────────────────────────┼─────────────────────────────┘
                          │ google.script.run
┌─────────────────────────▼─────────────────────────────┐
│                   Backend (GAS/.gs)                    │
│  ┌────────────────────┐  ┌──────────────────────┐    │
│  │  processRequest()  │  │  processBatch()       │    │
│  │  (dispatcher)      │  │  (batch dispatcher)   │    │
│  └─────────┬──────────┘  └──────────┬───────────┘    │
│            │                        │                 │
│  ┌─────────▼────────────────────────▼──────────┐     │
│  │              API Handlers                    │     │
│  │  (Schemas, Tables, Columns, Templates...)   │     │
│  └────────────────────┬────────────────────────┘     │
│                       │                              │
│  ┌────────────────────▼────────────────────────┐     │
│  │          Google Sheets (Data Store)          │     │
│  │  Категории, Назначения, Типы, Схемы,         │     │
│  │  Таблицы, Столбцы, Шаблоны                   │     │
│  └─────────────────────────────────────────────┘     │
└─────────────────────────────────────────────────────┘
```

---

## План исправлений (приоритет)

### Критические (сделать в первую очередь)
1. **Исправить `createAssignment`** — использовать правильный массив заголовков (или определить `ASG_HEADERS`)
2. **Удалить дублирующий `getColumnTypes`** handler в `processRequest`
3. **Добавить глобальную инвалидацию кэша** (`inv()`) после copySchema/importSchemaJson
4. **Добавить валидацию FK** при создании связи — проверять существование целевой таблицы/колонки

### Важные
5. **Разделить Frontend.html** минимум на 4 файла: Styles, JsCore, JsCanvas, JsUI
6. **Переименовать `.js` → `.gs`** для серверных файлов
7. **Изменить timeZone** на `Europe/Moscow`
8. **Добавить обработку ошибок** в sync-очереди — сохранять несохранённые действия в localStorage

### Улучшения архитектуры
9. **Разделить Backend.js** на логические модули (Utils, API handlers, Services)
10. **Вынести seed-данные** в отдельный `Seed.gs`
11. **Добавить транзакционность** для batch-операций — если один запрос падает, откатить все
12. **Добавить логирование** через `Logger.log()` для отладки

---

## Итог

Проект функционально насыщен и работает, но страдает от **монолитной структуры**. Главные проблемы:

| Проблема | Файл | Критичность |
|----------|------|-------------|
| `createAssignment` использует `CAT_HEADERS` | Backend.js | 🔴 Критический баг |
| Дублирующий handler `getColumnTypes` | Backend.js | 🟡 Средний |
| Sync-очередь теряет данные | Frontend.html | 🟡 Средний |
| Кэш колонок не инвалидируется | Frontend.html | 🟡 Средний |
| Монолитный Frontend.html (4106 строк) | Frontend.html | 🔴 Архитектурный |
| Монолитный Backend.js (1108 строк) | Backend.js | 🟡 Архитектурный |
| Неправильные расширения файлов | Все | 🟡 Конвенция |
