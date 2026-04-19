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

### 1. ✅ [РЕШЕНО] Frontend.html — монолитный файл
**Статус:** Исправлено. Фронтенд разделен на 16+ логических HTML-файлов (Styles, JsCore, JsCanvas и др.), подключаемых через `include()`.

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

### 2. ✅ [РЕШЕНО] Backend — перегруженный файл
**Статус:** Исправлено. Серверная логика разделена на `.gs` файлы по зонам ответственности (Schemas, Tables, Columns, Utils и др.).

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

### 3. ✅ [РЕШЕНО] Расширение файлов
**Статус:** Исправлено. Все серверные файлы используют расширение `.gs`.

---

### 4. ✅ [РЕШЕНО] appsscript.json — часовая зона
**Статус:** Исправлено. Установлена зона `Europe/Moscow`.

---

## Найденные баги и проблемы

### 🐛 [ИСПРАВЛЕНО] Баг 1: Дублирующийся handler
### 🐛 [ИСПРАВЛЕНО] Баг 2: Пустые имена категорий
### 🐛 [ИСПРАВЛЕНО] Баг 3: `createAssignment` заголовки
### 🐛 [ИСПРАВЛЕНО] Баг 5: Потеря данных Sync-очереди
### 🐛 [ИСПРАВЛЕНО] Баг 7: Invalidated Column Cache
### 🐛 [ИСПРАВЛЕНО] Баг 8: Boolean из Google Sheets (isTrue)

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
