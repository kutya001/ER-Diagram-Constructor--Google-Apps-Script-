# План рефакторинга — ER Diagram Constructor

> **Принцип:** «Ломай и чини по одному». Каждый этап — самостоятельный, проект остаётся рабочим после каждого шага. Деплой и тестирование после каждой фазы.

---

## Фаза 0: Подготовка (не затрагивает код)

| # | Задача | Объём | Риски |
|---|--------|-------|-------|
| 0.1 | Создать **копию** Google Spreadsheet (backup данных) | — | Нет |
| 0.2 | Создать **новую версию** GAS-проекта (клон через «Управление версиями → Создать») | — | Нет |
| 0.3 | Проверить, что текущий деплой работает — зафиксировать URL webapp | — | Нет |

**Критерий завершения:** Есть backup spreadsheet и копия проекта. Текущая версия работает.

---

## Фаза 1: Критические баги (быстрые фиксы, ~30 мин)

> Все изменения в существующих файлах. Не создаём новых файлов.

### 1.1 Исправить `createAssignment` — неправильный массив заголовков

**Файл:** `Backend.js`, ~строка 476

```js
// Было:
return _appendRow(SHEETS.ASSIGNMENTS, obj, CAT_HEADERS);

// Стало:
const ASG_HEADERS = ['id','name','description','create_date_time','update_date_time'];
// ...
return _appendRow(SHEETS.ASSIGNMENTS, obj, ASG_HEADERS);
```

**Проверка:** Создать новое назначение через UI → проверить, что оно появилось в листе «Назначение таблиц».

---

### 1.2 Удалить дублирующий handler `getColumnTypes`

**Файл:** `Backend.js`, секция `processRequest` (~строки 248 и 287)

Найти **второе** вхождение `getColumnTypes:` в объекте `handlers` и удалить его.

```js
// Удалить эту строку (дубликат):
getColumnTypes:        () => _allRows(SHEETS.COL_TYPES),
```

**Проверка:** `processRequest` по-прежнему возвращает типы колонок. Функционал не меняется.

---

### 1.3 Глобальная инвалидация кэша колонок

**Файл:** `Frontend.html`

После успешных операций `copySchema` и `importSchemaJson` добавить очистку всего кэша:

```js
// В функции, которая вызывает copySchema / importSchemaJson:
inv();  // без аргументов — CC.clear()
```

Найти все места вызова `api('copySchema', ...)` и `api('importSchemaJson', ...)` → в `.then()` добавить `inv()`.

**Проверка:** Скопировать схему → колонки на канвасе отображаются корректно.

---

### 1.4 Изменить timeZone на Europe/Moscow

**Файл:** `appsscript.json`

```json
"timeZone": "Europe/Moscow"
```

**Проверка:** Даты в таблицах отображаются в правильном часовом поясе.

---

**✅ Критерий завершения фазы 1:**
- Все 4 фикса задеплоены
- Ни одна существующая функция не сломана
- Багов из result.md (критических) больше нет

---

## Фаза 2: Разделение Frontend.html (основная работа, ~2–3 часа)

> Разбиваем монолит 4106 строк на логические HTML-файлы. **Порядок важен** — каждый следующий файл зависит от предыдущих.

### 2.1 Создать `Styles.html`

**Что вынести:** Всё между `<style>` и `</style>` из `Frontend.html` (~500 строк CSS).

**Содержимое `Styles.html`:**
```html
<style>
/* весь CSS из Frontend.html */
</style>
```

**В `Frontend.html`** заменить блок `<style>...</style>` на:
```html
<?!= HtmlService.createHtmlOutputFromFile('Styles').getContent() ?>
```

**Деплой + проверка:** Визуально ничего не изменилось. Все темы работают.

---

### 2.2 Создать `JsCore.html`

**Что вынести:** Первые ~200 строк `<script>` из `Frontend.html`:
- Блок THEME (`setTheme`, `TC`, `curTheme`)
- Блок STATE (`const S = {...}`)
- Блок SYNC ENGINE (`queueSync`, `flushSync`, `syncNow`, `setSyncState`)
- Column cache (`CC`, `gc`, `inv`)
- Константы Canvas (`TW`, `TH`, `CH`)
- Состояние Canvas (`sc`, `ox`, `oy`, `pan`, `drag`, ...)
- RAF flags (`rAF`, `mrAF`, `R`, `MR`)
- API-обёртки (`api`, `apiBatch`, `apiAll`)

**Содержимое `JsCore.html`:**
```html
<script>
'use strict';
// THEME
// ...
// STATE
// ...
// SYNC ENGINE
// ...
// CANVAS constants
// ...
// API
// ...
</script>
```

**В `Frontend.html`** после `<script>` (или вместо удалённого блока) вставить:
```html
<?!= HtmlService.createHtmlOutputFromFile('JsCore').getContent() ?>
```

**Деплой + проверка:** Загрузка, sync, API-вызовы работают.

---

### 2.3 Создать `JsInit.html`

**Что вынести:**
- `init()`
- `loadAll()`
- `hideLoader()`
- `renderSchemaSel()`
- `selSchema()`

**Деплой + проверка:** Приложение загружается, схема выбирается.

---

### 2.4 Создать `JsCanvas.html`

**Что вынести:**
- `resize()`
- `w2s()`, `s2w()`
- `setupCanvas()`
- `hitTable()`, `hitFK()`, `hitPK()`
- `isPK()`, `isFK()`
- `render()`
- `drawGrid()`, `drawEmpty()`, `drawRelDraft()`, `drawRels()`
- `hitRel()`
- `drawTable()` — полная отрисовка таблицы
- `miniRender()`
- `RR()`, `RRt()` — утилиты rounded rect

**Деплой + проверка:** Канвас рендерит таблицы, связи, мини-карту. Zoom/pan работают.

---

### 2.5 Создать `JsCanvasEvents.html`

**Что вынести:**
- `cvPos()`
- `onDown()`, `onMove()`, `onUp()`, `onGlobalUp()`
- `onWheel()`
- `onCtx()`
- `onDbl()`

**Деплой + проверка:** Drag таблиц, зум колесом, контекстное меню, двойной клик — всё работает.

---

### 2.6 Создать `JsUI.html`

**Что вынести:**
- `renderTree()`, `node()`
- `renderSbRight()`
- `selectTableFromSb()`
- `schCtxShow()`, `schCtxHide()`
- `detachSchema()`
- Sidebar toggle (`toggleSidebar`, `toggleSbLeft`, `toggleSbRight`)
- Panel toggle (`togglePanel`)
- Zoom controls (`zoomIn`, `zoomOut`, `resetView`)
- Layout menu (`toggleLayoutMenu`, `doLayout`)

**Деплой + проверка:** Сайдбар, дерево схем, правая панель — всё работает.

---

### 2.7 Создать `JsSchema.html`

**Что вынести:**
- `openCreateSchema()`
- `submitSchema()`
- `copySchema()`
- `deleteSchema()`
- Логика модального окна схемы

**Деплой + проверка:** Создание, копирование, удаление схем.

---

### 2.8 Создать `JsTable.html`

**Что вынести:**
- `addTable()`
- `openEditTable()`
- `submitTable()`
- `mtAddRow()`, `mtRemoveRow()`
- `mtNameChanged()`, `onCatChange()`, `onTypeChange()`
- `loadFkCols()`
- Логика модального окна таблицы и редактора колонок

**Деплой + проверка:** Создание/редактирование таблиц и колонок.

---

### 2.9 Создать `JsColumnEditor.html`

**Что вынести:**
- `openAddCol()`
- `openEditCol()`
- `submitCol()`
- `deleteCol()`
- Drag-and-drop колонок (reorder)
- Правая панель: вкладка «Колонки»

**Деплой + проверка:** CRUD колонок через правую панель и модальное окно.

---

### 2.10 Создать `JsTemplates.html`

**Что вынести:**
- `openTplManager()`
- `newTpl()`, `editTpl()`, `deleteTpl()`
- Рендер списка шаблонов
- Редактор шаблона (колонки шаблона)
- `applyTemplate()`

**Деплой + проверка:** Управление шаблонами, применение к таблицам.

---

### 2.11 Создать `JsRelations.html`

**Что вынести:**
- `openRels()`
- Рендер списка связей
- `relPopup` (popup при клике на линию связи)
- Создание/удаление/редактирование FK-связей

**Деплой + проверка:** Вкладка «Связи», popup при клике на линию.

---

### 2.12 Создать `JsBuilder.html`

**Что вынести:**
- `openBuilder()`
- UI построителя листов (таблицы Google Sheets)
- Анализ схемы (`analyseSchema`)
- Создание листов, удаление, превью данных
- Bulk actions bar

**Деплой + проверка:** Вкладка «🏗 Листы», анализ, создание листов.

---

### 2.13 Создать `JsDicts.html`

**Что вынести:**
- `openDicts()`
- Вкладки справочников (типы колонок, категории, назначения)
- CRUD для каждого справочника
- `dtab`, `drow`, `dadd` логика

**Деплой + проверка:** Модальное окно «⚙️ Справочники», CRUD элементов.

---

### 2.14 Создать `JsJson.html`

**Что вынести:**
- `openJson()`
- Экспорт в JSON (syntax highlighting)
- Импорт из JSON (AI prompt area)
- Копирование, скачивание, загрузка файла

**Деплой + проверка:** Модальное окно JSON, экспорт/импорт.

---

### 2.15 Создать `JsExportSS.html`

**Что вынести:**
- `openExportSS()`
- `doExportSS()`
- Превью таблиц для экспорта
- Progress, result display

**Деплой + проверка:** Кнопка «📤 В таблицу», создание отдельной Google Таблицы.

---

### 2.16 Создать `JsUtils.html`

**Что вынести:**
- `toast()`
- `confirm()`
- `openM()`, `closeM()`
- `showLoader()`, `hideLoader()`
- `formatDate()`
- `setupTabs()`
- Sidebar resize (`sbResize`, `sbDivider`)

**Деплой + проверка:** Toast-уведомления, модальные окна, ресайз сайдбара.

---

### 2.17 Очистить `Frontend.html`

После всех выносов `Frontend.html` должен содержать:

```html
<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1.0"/>
<title>ER Diagram Constructor</title>
<?!= HtmlService.createHtmlOutputFromFile('Styles').getContent() ?>
</head>
<body data-theme="dark">

<!-- HTML-разметка (без CSS, без JS) -->
<!-- topbar, sidebar, canvas, rpanel, modals -->

<?!= HtmlService.createHtmlOutputFromFile('JsCore').getContent() ?>
<?!= HtmlService.createHtmlOutputFromFile('JsInit').getContent() ?>
<?!= HtmlService.createHtmlOutputFromFile('JsCanvas').getContent() ?>
<?!= HtmlService.createHtmlOutputFromFile('JsCanvasEvents').getContent() ?>
<?!= HtmlService.createHtmlOutputFromFile('JsUI').getContent() ?>
<?!= HtmlService.createHtmlOutputFromFile('JsSchema').getContent() ?>
<?!= HtmlService.createHtmlOutputFromFile('JsTable').getContent() ?>
<?!= HtmlService.createHtmlOutputFromFile('JsColumnEditor').getContent() ?>
<?!= HtmlService.createHtmlOutputFromFile('JsTemplates').getContent() ?>
<?!= HtmlService.createHtmlOutputFromFile('JsRelations').getContent() ?>
<?!= HtmlService.createHtmlOutputFromFile('JsBuilder').getContent() ?>
<?!= HtmlService.createHtmlOutputFromFile('JsDicts').getContent() ?>
<?!= HtmlService.createHtmlOutputFromFile('JsJson').getContent() ?>
<?!= HtmlService.createHtmlOutputFromFile('JsExportSS').getContent() ?>
<?!= HtmlService.createHtmlOutputFromFile('JsUtils').getContent() ?>

</body>
</html>
```

**Итоговый размер Frontend.html:** ~80-100 строк (чистая HTML-разметка).

**Финальная проверка:** Полное регрессионное тестирование — **каждая кнопка, каждая модалка, каждый drag**.

---

**✅ Критерий завершения фазы 2:**
- Frontend.html ≤ 100 строк
- 16 новых HTML-файлов
- Все функции работают без изменений
- Деплой прошёл без ошибок

---

## Фаза 3: Реорганизация Backend (1–2 часа)

> GAS компилирует все `.gs` файлы в один контекст. Просто разделяем код по файлам — логика не меняется.

### 3.1 Создать `Utils.gs`

**Что перенести из `Backend.js`:**
- `_sheet()`
- `_allRows()`
- `_nextId()`
- `_appendRow()`
- `_updateRow()`
- `_deleteRow()`
- `_batchDeleteWhere()`

**Оставить в `Backend.js`:** `doGet()`, `initSheets()`, `processRequest()`, `processBatch()`, `loadAllData()`

---

### 3.2 Создать `Schemas.gs`

**Что перенести:**
- `SCHEMA_HEADERS`
- `createSchema()`
- `updateSchema()`
- `deleteSchema()`
- `copySchema()`
- `detachSchema()`
- `getTablesBySchema()` (можно оставить в Tables.gs)

---

### 3.3 Создать `Tables.gs`

**Что перенести:**
- `TABLE_HEADERS`
- `getTablesBySchema()`
- `createTable()`
- `updateTable()`
- `deleteTable()`
- `copyTable()`
- `createTableWithTemplate()`

---

### 3.4 Создать `Columns.gs`

**Что перенести:**
- `COL_HEADERS`
- `getColumnsByTable()`
- `createColumn()`
- `updateColumn()`
- `deleteColumn()`
- `reorderColumns()`

---

### 3.5 Создать `Relations.gs`

**Что перенести:**
- `createRelation()`
- `deleteRelation()`

---

### 3.6 Создать `Templates.gs`

**Что перенести:**
- `TPL_HEADERS`, `TCOL_HEADERS`
- `getTemplateColumns()`
- `createTemplate()`
- `updateTemplate()`
- `deleteTemplate()`
- `createTemplateColumn()`
- `updateTemplateColumn()`
- `deleteTemplateColumn()`
- `reorderTemplateColumns()`
- `applyTemplate()`
- `getTemplatesForCategory()`

---

### 3.7 Создать `SystemTables.gs`

**Что перенести:**
- `CAT_HEADERS`, `ASG_HEADERS`, `CT_HEADERS`
- `createCategoryItem()`, `updateCategoryItem()`, `deleteCategoryItem()`
- `createAssignment()`, `updateAssignment()`, `deleteAssignment()`
- `createColumnType()`, `updateColumnType()`, `deleteColumnType()`

---

### 3.8 Создать `JsonExport.gs`

**Что перенести:**
- `exportSchemaJson()`
- `importSchemaJson()`

---

### 3.9 Создать `Instructions.gs`

**Что перенести:**
- `INST_SHEET`
- `getInstruction()`
- `saveInstruction()`

---

### 3.10 Создать `SystemDump.gs`

**Что перенести:**
- `getSystemDump()`

---

### 3.11 Переименовать `Backend.js` → `Backend.gs`

В интерфейсе Google Apps Script:
1. Создать новый файл `Backend.gs`
2. Скопировать содержимое `Backend.js` (минус то, что перенесено)
3. Удалить `Backend.js`

---

### 3.12 Переименовать `CreateTables.js` → `CreateTables.gs`

Аналогично — создать `.gs`, скопировать, удалить `.js`.

---

### 3.13 Итоговый `Backend.gs` (после всех выносов)

```js
// Backend.gs — точка входа

const SHEETS = { ... };  // оставить здесь

function doGet() { ... }
function initSheets() { ... }
function _seedDefaults() { ... }
function _seedDefaultTemplates() { ... }

function processBatch(requests) { ... }
function loadAllData() { ... }

function processRequest(action, payload) {
  // Диспетчер — только вызов функций из других файлов
  const handlers = {
    getSchemas:     () => _allRows(SHEETS.SCHEMAS),
    createSchema:   () => createSchema(payload),
    // ... и так далее — все handlers вызывают функции из других файлов
  };
  // ...
}
```

**Размер:** ~60-80 строк (только диспетчер и инициализация).

---

**✅ Критерий завершения фазы 3:**
- `Backend.gs` ≤ 100 строк
- 9+ новых `.gs` файлов
- Все API-endpoint'ы работают
- `clasp push` проходит без ошибок

---

## Фаза 4: Улучшения качества кода (1–2 часа)

### 4.1 Единая функция `isTrue()` для boolean-проверок

**Проблема:** `isPK()`, `isFK()` и встроенные проверки дублируются.

**Решение:** Создать в `Utils.gs`:

```js
function isTrue(v) {
  return v === true || v === 'true' || v === 'TRUE';
}
```

Заменить все `c.is_pk === true || c.is_pk === 'true' || c.is_pk === 'TRUE'` на `isTrue(c.is_pk)`.

---

### 4.2 Валидация FK-связей

В `createColumn()` и `createRelation()` добавить проверку:

```js
function validateFkTarget(fkTableId, fkColumnId) {
  const table = _allRows(SHEETS.TABLES).find(t => String(t.id) === String(fkTableId));
  if (!table) throw new Error('Целевая таблица не найдена: ' + fkTableId);
  if (fkColumnId) {
    const col = _allRows(SHEETS.COLUMNS).find(c => String(c.id) === String(fkColumnId));
    if (!col) throw new Error('Целевая колонка не найдена: ' + fkColumnId);
  }
}
```

---

### 4.3 Сохранение несохранённых действий в localStorage

В `flushSync()` при окончательном отказе (после 3 попыток):

```js
// В catch блока flushSync:
if (syncErrCount >= 3) {
  // Сохранить в localStorage для восстановления
  const failed = batch.map(b => ({ action: b.action, payload: b.payload }));
  localStorage.setItem('er_failed_sync', JSON.stringify(failed));
  batch.forEach(b => b.reject && b.reject(e));
  toast('Ошибка синхронизации — данные сохранены локально', 'err');
}
```

Добавить кнопку «Повторить» в UI, которая читает `er_failed_sync` и пытается отправить снова.

---

### 4.4 Логирование через Logger.log

Добавить в ключевые функции `Backend.gs`:

```js
function createSchema(p) {
  Logger.log('createSchema: ' + JSON.stringify(p));
  // ...
}
```

Это поможет отлаживать проблемы через «Журнал выполнения» в GAS.

---

### 4.5 Обработка ошибок `_updateRow`

Если `headers` не соответствуют реальным колонкам листа, `_updateRow` молча запишет `''` в недостающие колонки. Добавить проверку:

```js
function _updateRow(sheetName, id, updates, headers) {
  const sh = _sheet(sheetName);
  if (sh.getLastRow() <= 1) return null;
  const actualCols = sh.getLastColumn();
  if (actualCols !== headers.length) {
    Logger.log('Warning: headers mismatch for ' + sheetName +
      ' (expected ' + headers.length + ', got ' + actualCols + ')');
  }
  // ... дальше как было
}
```

---

**✅ Критерий завершения фазы 4:**
- Все boolean-проверки через `isTrue()`
- FK-валидация работает
- Несохранившиеся данные не теряются
- Логирование добавлено

---

## Итоговая структура проекта (после всех фаз)

```
📁 ER Diagram Constructor
│
├── appsscript.json                 # timeZone: Europe/Moscow
│
├── Backend.gs                      # doGet, initSheets, processRequest, processBatch
├── Utils.gs                        # Общие утилиты + isTrue()
├── Schemas.gs                      # CRUD схем
├── Tables.gs                       # CRUD таблиц
├── Columns.gs                      # CRUD колонок
├── Relations.gs                    # FK-связи
├── Templates.gs                    # Шаблоны
├── SystemTables.gs                 # Категории, назначения, типы колонок
├── JsonExport.gs                   # JSON экспорт/импорт
├── Instructions.gs                 # Инструкция
├── SystemDump.gs                   # Дамп системы
├── CreateTables.gs                 # Генерация листов из схем
│
├── Frontend.html                   # Точка входа (HTML-разметка + <?!= include() ?>)
├── Styles.html                     # CSS
├── JsCore.html                     # Состояние, sync, API-обёртки
├── JsInit.html                     # Инициализация
├── JsCanvas.html                   # Canvas-рендеринг
├── JsCanvasEvents.html             # Canvas-события
├── JsUI.html                       # UI: сайдбар, зум, layout
├── JsSchema.html                   # UI: схемы
├── JsTable.html                    # UI: таблицы
├── JsColumnEditor.html             # UI: колонки
├── JsTemplates.html                # UI: шаблоны
├── JsRelations.html                # UI: связи
├── JsBuilder.html                  # UI: построитель листов
├── JsDicts.html                    # UI: справочники
├── JsJson.html                     # UI: JSON
├── JsExportSS.html                 # UI: экспорт в Google Таблицу
└── JsUtils.html                    # Утилиты: toast, confirm, modals
```

**Итого:** ~28 файлов вместо 4. Каждый файл — 50-250 строк вместо 1100-4100.

---

## Хронология выполнения

| Фаза | Что делает | Ожидаемое время | Приоритет |
|------|-----------|-----------------|-----------|
| **0** | Backup | 5 мин | Обязательно |
| **1** | Критические баги | 30 мин | 🔴 Критично |
| **2** | Разделение Frontend | 2-3 часа | 🔴 Критично |
| **3** | Разделение Backend | 1-2 часа | 🟡 Важно |
| **4** | Улучшения качества | 1-2 часа | 🟡 Важно |

**Общее время:** 5-8 часов работы.

---

## Правила при выполнении

1. **Одна задача за раз.** Не начинать следующую задачу, пока не задеплоена и протестирована текущая.
2. **После каждой задачи — коммит** (или сохранение версии в GAS).
3. **После каждой фазы — полное регрессионное тестирование.**
4. **Если что-то сломалось — откат к backup** из Фазы 0.
5. **Не менять логику** при рефакторинге. Переносим код как есть, исправления — только в Фазе 1 и Фазе 4.
6. **Тестировать на реальных данных** — создать тестовую схему с 3-5 таблицами, проверить все операции.

---

## Чек-лист тестирования (после каждой фазы)

- [ ] Приложение загружается (doGet → init → loadAll)
- [ ] Создание схемы
- [ ] Копирование схемы
- [ ] Удаление схемы
- [ ] Выбор схемы → таблицы отображаются на канвасе
- [ ] Создание таблицы
- [ ] Редактирование таблицы (имя, описание, категория)
- [ ] Добавление колонки
- [ ] Редактирование колонки (тип, FK)
- [ ] Удаление колонки
- [ ] Drag таблицы на канвасе
- [ ] Zoom in/out
- [ ] Панорамирование канваса
- [ ] Контекстное меню на таблице
- [ ] Двойной клик → редактирование
- [ ] Создание FK-связи (drag от PK к FK)
- [ ] Вкладка «Связи» — список отображается
- [ ] Клик на линию связи → popup
- [ ] Создание шаблона
- [ ] Применение шаблона к таблице
- [ ] Справочники: добавить/удалить тип колонки
- [ ] Справочники: добавить/удалить категорию
- [ ] JSON экспорт → копирование
- [ ] JSON импорт → схема создалась
- [ ] 🏗 Листы: анализ схемы
- [ ] 🏗 Листы: создание листов
- [ ] 📤 Экспорт в отдельную Google Таблицу
- [ ] Мини-карта отображается
- [ ] Переключение темы (dark/light/warm)
- [ ] Скрытие/показ сайдбара
- [ ] Сайдбар ресайз
- [ ] Sync badge: pending → syncing → synced
- [ ] Кнопка «🔄 Синхронизировать»
- [ ] 💾 Сохранить всё
