// ============================================================
// Seed.gs — Seed данных по умолчанию при инициализации
// ============================================================
// Зависит: Backend.gs (SHEETS), Utils.gs (_allRows)
// ============================================================

function _seedDefaults(ss) {
  // Seed column types if empty
  const ctSheet = ss.getSheetByName(SHEETS.COL_TYPES);
  if (ctSheet.getLastRow() <= 1) {
    const defaults = [
      ['PK',   'pk',   'Первичный ключ'],
      ['FK',   'fk',   'Внешний ключ'],
      ['INT',  'int',  'Целое число'],
      ['BIGINT','bigint','Большое целое число'],
      ['FLOAT','float','Число с плавающей точкой'],
      ['BOOL', 'bool', 'Логический тип'],
      ['STR',  'str',  'Строка'],
      ['TEXT', 'text', 'Длинный текст'],
      ['DATE', 'date', 'Дата'],
      ['TIME', 'time', 'Время'],
      ['DATETIME','datetime','Дата и время'],
      ['UUID', 'uuid', 'Уникальный идентификатор'],
      ['JSON', 'json', 'JSON объект'],
    ];
    const now = new Date().toISOString();
    defaults.forEach((row, i) => {
      ctSheet.appendRow([i + 1, row[0], row[1], row[2], now, now]);
    });
  }

  // Seed categories
  const catSheet = ss.getSheetByName(SHEETS.CATEGORIES);
  if (catSheet.getLastRow() <= 1) {
    const now = new Date().toISOString();
    [
      ['Справочник',  'Справочная таблица с нормативными данными'],
      ['Транзакции',  'Таблица транзакционных данных'],
      ['Шапка',       'Шапка составного документа'],
      ['Детали',      'Строки (детали) составного документа'],
    ].forEach((row, i) => catSheet.appendRow([i+1, row[0], row[1], now, now]));
  }

  // Seed assignments
  const asgSheet = ss.getSheetByName(SHEETS.ASSIGNMENTS);
  if (asgSheet.getLastRow() <= 1) {
    const now = new Date().toISOString();
    [
      ['Финансы',  'Финансовый модуль'],
      ['Закупки',  'Модуль закупок'],
      ['Продажи',  'Модуль продаж'],
      ['Склад',    'Складской учёт'],
      ['HR',       'Кадровый модуль'],
      ['Общее',    'Общие данные'],
    ].forEach((row, i) => asgSheet.appendRow([i+1, row[0], row[1], now, now]));
  }

  _seedDefaultTemplates(ss);
}

function _seedDefaultTemplates(ss) {
  const tplSheet  = ss.getSheetByName(SHEETS.TEMPLATES);
  const tcolSheet = ss.getSheetByName(SHEETS.TEMPLATE_COLS);
  if (tplSheet.getLastRow() > 1) return; // already seeded

  const now = new Date().toISOString();

  const colTypes = _allRows(SHEETS.COL_TYPES);
  function typeId(des) {
    const t = colTypes.find(t => t.designation === des);
    return t ? t.id : '';
  }

  const catRows = _allRows(SHEETS.CATEGORIES);
  function catId(name) {
    const c = catRows.find(c => c.name === name);
    return c ? c.id : '';
  }

  const templates = [
    {
      name: 'Базовый (все таблицы)',
      category_id: '',
      description: 'Минимальный набор: первичный ключ. Применяется ко всем категориям.',
      cols: [
        { name: 'id',   type: 'pk',  is_pk: true,  is_fk: false, desc: 'Первичный ключ, автоинкремент' },
      ]
    },
    {
      name: 'Транзакции',
      category_id: 'Транзакции',
      description: 'Стандартный набор для транзакционных таблиц.',
      cols: [
        { name: 'id',               type: 'pk',       is_pk: true,  is_fk: false, desc: 'Первичный ключ' },
        { name: 'create_date_time', type: 'datetime', is_pk: false, is_fk: false, desc: 'Дата и время создания записи' },
        { name: 'update_date_time', type: 'datetime', is_pk: false, is_fk: false, desc: 'Дата и время последнего обновления' },
        { name: 'is_active',        type: 'bool',     is_pk: false, is_fk: false, desc: 'Признак активности записи' },
      ]
    },
    {
      name: 'Справочник',
      category_id: 'Справочник',
      description: 'Стандартный набор для справочных таблиц.',
      cols: [
        { name: 'id',          type: 'pk',   is_pk: true,  is_fk: false, desc: 'Первичный ключ' },
        { name: 'name',        type: 'str',  is_pk: false, is_fk: false, desc: 'Наименование' },
        { name: 'description', type: 'text', is_pk: false, is_fk: false, desc: 'Описание' },
        { name: 'is_active',   type: 'bool', is_pk: false, is_fk: false, desc: 'Активен' },
      ]
    },
    {
      name: 'Шапка документа',
      category_id: 'Шапка',
      description: 'Стандартный набор для шапки составного документа.',
      cols: [
        { name: 'id',               type: 'pk',       is_pk: true,  is_fk: false, desc: 'Первичный ключ' },
        { name: 'doc_number',       type: 'str',      is_pk: false, is_fk: false, desc: 'Номер документа' },
        { name: 'doc_date',         type: 'date',     is_pk: false, is_fk: false, desc: 'Дата документа' },
        { name: 'status',           type: 'str',      is_pk: false, is_fk: false, desc: 'Статус документа' },
        { name: 'create_date_time', type: 'datetime', is_pk: false, is_fk: false, desc: 'Создан' },
        { name: 'update_date_time', type: 'datetime', is_pk: false, is_fk: false, desc: 'Изменён' },
      ]
    },
    {
      name: 'Детали документа',
      category_id: 'Детали',
      description: 'Стандартный набор для строк (деталей) составного документа.',
      cols: [
        { name: 'id',         type: 'pk',   is_pk: true,  is_fk: false, desc: 'Первичный ключ' },
        { name: 'header_id',  type: 'fk',   is_pk: false, is_fk: true,  desc: 'Ссылка на шапку документа' },
        { name: 'line_no',    type: 'int',  is_pk: false, is_fk: false, desc: 'Номер строки' },
        { name: 'quantity',   type: 'float',is_pk: false, is_fk: false, desc: 'Количество' },
        { name: 'unit_price', type: 'float',is_pk: false, is_fk: false, desc: 'Цена за единицу' },
        { name: 'amount',     type: 'float',is_pk: false, is_fk: false, desc: 'Сумма' },
      ]
    },
  ];

  let tplId = 1, tcolId = 1;
  templates.forEach(tpl => {
    const resolvedCatId = tpl.category_id ? catId(tpl.category_id) : '';
    tplSheet.appendRow([tplId, tpl.name, resolvedCatId, tpl.description, now, now]);
    tpl.cols.forEach((col, pos) => {
      tcolSheet.appendRow([tcolId, tplId, col.name, col.desc, typeId(col.type), col.is_pk, col.is_fk, pos+1, now, now]);
      tcolId++;
    });
    tplId++;
  });
}
