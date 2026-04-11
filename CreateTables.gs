// ============================================================
// CreateTables.gs — Schema → Google Sheets builder
// ============================================================
// Зависит от Backend.gs (SHEETS, _allRows, _sheet, _nextId)
// ============================================================

// ─── System sheet names (protected, never touched) ───────────
const SYSTEM_SHEETS = [
  'Категории таблиц','Назначение таблиц','Типы колонок',
  'Схемы Баз данных','Таблицы','Столбцы Таблиц',
  'Шаблоны таблиц','Столбцы шаблонов',
];

// ─── Google Sheets format mapping by type designation ────────
// Returns { numberFormat, validation, bgColor, exampleFn }
function getTypeProfile(des) {
  const d = (des || '').toLowerCase();
  const MAP = {
    pk:       { fmt:'0',           bg:'#fff2cc', note:'Целое число (PK)',     ex:()=>1 },
    fk:       { fmt:'0',           bg:'#fce5cd', note:'Целое число (FK)',     ex:()=>1 },
    int:      { fmt:'0',           bg:'#f3f3f3', note:'Целое число',          ex:()=>Math.floor(Math.random()*1000) },
    bigint:   { fmt:'0',           bg:'#f3f3f3', note:'Большое целое',        ex:()=>Math.floor(Math.random()*1e9) },
    float:    { fmt:'0.00##',      bg:'#e8f5e9', note:'Число с точкой',       ex:()=>parseFloat((Math.random()*1000).toFixed(2)) },
    numeric:  { fmt:'0.00##',      bg:'#e8f5e9', note:'Десятичное',           ex:()=>parseFloat((Math.random()*1000).toFixed(4)) },
    decimal:  { fmt:'#,##0.00',    bg:'#e8f5e9', note:'Валюта/сумма',        ex:()=>parseFloat((Math.random()*10000).toFixed(2)) },
    money:    { fmt:'"₽"#,##0.00', bg:'#e8f5e9', note:'Деньги',              ex:()=>parseFloat((Math.random()*10000).toFixed(2)) },
    bool:     { fmt:'BOOLEAN',     bg:'#e3f2fd', note:'TRUE / FALSE',         ex:()=>Math.random()>.5 },
    boolean:  { fmt:'BOOLEAN',     bg:'#e3f2fd', note:'TRUE / FALSE',         ex:()=>Math.random()>.5 },
    str:      { fmt:'@',           bg:'#ffffff', note:'Текстовая строка',     ex:()=>'Значение '+Math.floor(Math.random()*100) },
    varchar:  { fmt:'@',           bg:'#ffffff', note:'Текстовая строка',     ex:()=>'Текст '+Math.floor(Math.random()*100) },
    char:     { fmt:'@',           bg:'#ffffff', note:'Строка (char)',         ex:()=>'A' },
    text:     { fmt:'@',           bg:'#f9f9f9', note:'Длинный текст',        ex:()=>'Описание записи #'+Math.floor(Math.random()*100) },
    date:     { fmt:'dd.MM.yyyy',  bg:'#fce4ec', note:'Дата (дд.мм.гггг)',   ex:()=>new Date(Date.now()-Math.random()*365*24*3600000) },
    time:     { fmt:'HH:mm:ss',    bg:'#f3e5f5', note:'Время (чч:мм:сс)',    ex:()=>new Date(Math.random()*86400000) },
    datetime: { fmt:'dd.MM.yyyy HH:mm:ss', bg:'#e8eaf6', note:'Дата и время',ex:()=>new Date(Date.now()-Math.random()*365*24*3600000) },
    timestamp:{ fmt:'dd.MM.yyyy HH:mm:ss', bg:'#e8eaf6', note:'Timestamp',   ex:()=>new Date() },
    uuid:     { fmt:'@',           bg:'#f0f4ff', note:'UUID строка',          ex:()=>Utilities.getUuid() },
    json:     { fmt:'@',           bg:'#fafafa', note:'JSON текст',           ex:()=>'{"key":"value"}' },
    array:    { fmt:'@',           bg:'#fafafa', note:'Массив (текст)',        ex:()=>'[1,2,3]' },
    email:    { fmt:'@',           bg:'#e0f2f1', note:'Email адрес',          ex:()=>'user@example.com' },
    url:      { fmt:'@',           bg:'#e0f7fa', note:'URL ссылка',           ex:()=>'https://example.com' },
    phone:    { fmt:'@',           bg:'#e8f5e9', note:'Телефон',              ex:()=>'+7 (9'+Math.floor(10+Math.random()*89)+') '+Math.floor(100+Math.random()*900)+'-'+Math.floor(10+Math.random()*90)+'-'+Math.floor(10+Math.random()*90) },
  };
  return MAP[d] || { fmt:'@', bg:'#ffffff', note:des||'Строка', ex:()=>'' };
}

// ─── Category → sheet tab color ─────────────────────────────
function getCategoryTabColor(catId) {
  const cats = _allRows(SHEETS.CATEGORIES);
  const cat  = cats.find(c => String(c.id) === String(catId));
  if (!cat) return '#9e9e9e';
  const PALETTE = ['#4285f4','#0f9d58','#f4b400','#db4437','#ab47bc','#00bcd4','#ff7043','#607d8b'];
  let h = 0;
  for (const ch of String(catId)) h = (Math.imul(31, h) + ch.charCodeAt(0)) | 0;
  return PALETTE[Math.abs(h) % PALETTE.length];
}

// ─── Load schema data ────────────────────────────────────────
function _getSchemaData(schemaId) {
  const schemas = _allRows(SHEETS.SCHEMAS);
  const schema  = schemas.find(s => String(s.id) === String(schemaId));
  if (!schema) throw new Error('Схема не найдена: ' + schemaId);
  const tables  = _allRows(SHEETS.TABLES).filter(t => String(t.schema_id) === String(schemaId));
  const allCols = _allRows(SHEETS.COLUMNS);
  const colTypes= _allRows(SHEETS.COL_TYPES);
  const cats    = _allRows(SHEETS.CATEGORIES);
  return { schema, tables, allCols, colTypes, cats };
}

// ─── Create all tables for a schema ─────────────────────────
function createSchemaTables(payload) {
  const { schema_id, with_examples, example_rows } = payload;
  const nRows = parseInt(example_rows) || 3;
  const { schema, tables, allCols, colTypes, cats } = _getSchemaData(schema_id);
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  const created = [], skipped = [];
  tables.forEach(table => {
    const cols = allCols.filter(c => String(c.table_id) === String(table.id))
                        .sort((a,b) => Number(a.position)-Number(b.position));
    if (ss.getSheetByName(table.name)) { skipped.push(table.name); return; }
    const sheet = ss.insertSheet(table.name);
    _formatSheet(sheet, table, cols, colTypes, cats, with_examples, nRows);
    created.push(table.name);
  });
  return { created, skipped, total: tables.length };
}

// ─── Create single table ─────────────────────────────────────
function createSchemaTable(payload) {
  const { schema_id, table_id, with_examples, example_rows } = payload;
  const nRows = parseInt(example_rows)||3;
  const { tables, allCols, colTypes, cats } = _getSchemaData(schema_id);
  const table = tables.find(t=>String(t.id)===String(table_id));
  if (!table) throw new Error('Таблица не найдена');
  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  const exist = ss.getSheetByName(table.name);
  if (exist) ss.deleteSheet(exist);
  const cols  = allCols.filter(c=>String(c.table_id)===String(table.id)).sort((a,b)=>+a.position-+b.position);
  const sheet = ss.insertSheet(table.name);
  _formatSheet(sheet, table, cols, colTypes, cats, with_examples, nRows);
  return { name: table.name };
}

// ─── Delete sheet by name ────────────────────────────────────
function deleteSchemaSheet(payload) {
  const { sheet_name } = payload;
  if (SYSTEM_SHEETS.includes(sheet_name)) throw new Error('Системный лист нельзя удалить');
  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(sheet_name);
  if (!sheet) throw new Error('Лист не найден: ' + sheet_name);
  if (ss.getSheets().length <= 1) throw new Error('Нельзя удалить единственный лист');
  ss.deleteSheet(sheet);
  return { deleted: sheet_name };
}

// ─── Delete column from sheet ────────────────────────────────
function deleteSheetColumn(payload) {
  const { sheet_name, col_name } = payload;
  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(sheet_name);
  if (!sheet) throw new Error('Лист не найден');
  const headers = sheet.getRange(1,1,1,sheet.getLastColumn()).getValues()[0];
  const idx     = headers.findIndex(h => h === col_name);
  if (idx === -1) throw new Error(`Столбец "${col_name}" не найден`);
  sheet.deleteColumn(idx+1);
  return { deleted_col: col_name };
}

// ─── Add sample data to existing sheet ──────────────────────
function addExampleData(payload) {
  const { schema_id, table_id, rows } = payload;
  const nRows = parseInt(rows)||3;
  const { tables, allCols, colTypes } = _getSchemaData(schema_id);
  const table  = tables.find(t=>String(t.id)===String(table_id));
  if (!table) throw new Error('Таблица не найдена');
  const cols   = allCols.filter(c=>String(c.table_id)===String(table.id)).sort((a,b)=>+a.position-+b.position);
  const ss     = SpreadsheetApp.getActiveSpreadsheet();
  const sheet  = ss.getSheetByName(table.name);
  if (!sheet) throw new Error('Лист не найден: '+table.name);
  _appendExamples(sheet, cols, colTypes, nRows);
  return { table: table.name, added: nRows };
}

// ─── Analyse sheet vs schema ─────────────────────────────────
function analyseSchema(payload) {
  const { schema_id } = payload;
  const { schema, tables, allCols, colTypes } = _getSchemaData(schema_id);
  const ss      = SpreadsheetApp.getActiveSpreadsheet();
  const allShts = ss.getSheets().map(s=>s.getName()).filter(n=>!SYSTEM_SHEETS.includes(n));

  const schemaNames = new Set(tables.map(t=>t.name));
  const sheetNames  = new Set(allShts);

  const result = {
    schema_name: schema.name,
    tables: [],
    extra_sheets: [],   // sheets not in schema
    missing_sheets: [], // schema tables with no sheet
  };

  // Extra sheets
  allShts.forEach(name => {
    if (!schemaNames.has(name)) result.extra_sheets.push(name);
  });

  // Analyse each schema table
  tables.forEach(table => {
    const schCols   = allCols.filter(c=>String(c.table_id)===String(table.id)).sort((a,b)=>+a.position-+b.position);
    const sheet     = ss.getSheetByName(table.name);
    const tableRes  = {
      id:     table.id,
      name:   table.name,
      status: sheet ? 'exists' : 'missing',
      cols:   [],
      extra_cols: [],
    };
    if (!sheet) { result.missing_sheets.push(table.name); result.tables.push(tableRes); return; }

    const lastCol  = sheet.getLastColumn();
    const headers  = lastCol>0 ? sheet.getRange(1,1,1,lastCol).getValues()[0].map(String) : [];
    const headerSet= new Set(headers);

    // Check schema columns
    schCols.forEach(col => {
      const ct   = colTypes.find(t=>String(t.id)===String(col.type_id));
      const des  = ct ? ct.designation.toLowerCase() : '';
      const prof = getTypeProfile(des);
      const cidx = headers.indexOf(col.name);
      const colRes= { name:col.name, expected_type:des, status:'', fmt_ok:null };

      if (cidx === -1) {
        colRes.status = 'missing';
      } else {
        // Check actual column format
        const cellFmt = lastCol>0 && sheet.getLastRow()>0
          ? sheet.getRange(1, cidx+1).getNumberFormat()
          : '@';
        const fmtMatch = _fmtCompatible(cellFmt, prof.fmt);
        colRes.status = fmtMatch ? 'ok' : 'wrong_type';
        colRes.fmt_ok  = fmtMatch;
        colRes.actual_fmt = cellFmt;
        colRes.expected_fmt = prof.fmt;
      }
      tableRes.cols.push(colRes);
    });

    // Extra columns
    headers.forEach(h => {
      if (h && !schCols.find(c=>c.name===h)) tableRes.extra_cols.push(h);
    });

    result.tables.push(tableRes);
  });

  return result;
}

// ─── Get sheet data (preview) ────────────────────────────────
function getSheetData(payload) {
  const { sheet_name, max_rows } = payload;
  const limit = Math.min(parseInt(max_rows)||50, 200);
  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(sheet_name);
  if (!sheet) throw new Error('Лист не найден: '+sheet_name);
  const last  = sheet.getLastRow();
  const lastC = sheet.getLastColumn();
  if (last<1||lastC<1) return { headers:[], rows:[], total:0 };

  const headers = sheet.getRange(1,1,1,lastC).getValues()[0].map(String);
  const nRows   = Math.min(last-1, limit);
  const rows    = nRows>0
    ? sheet.getRange(2,1,nRows,lastC).getDisplayValues()
    : [];
  return { headers, rows, total: last-1, showing: nRows };
}

// ─── List all non-system sheets ──────────────────────────────
function listSheets(payload) {
  const ss   = SpreadsheetApp.getActiveSpreadsheet();
  const list = ss.getSheets()
    .filter(s=>!SYSTEM_SHEETS.includes(s.getName()))
    .map(s=>({ name:s.getName(), rows: s.getLastRow()-1, cols: s.getLastColumn() }));
  return list;
}

// ─── Format sheet helper ─────────────────────────────────────
function _formatSheet(sheet, table, cols, colTypes, cats, withExamples, nRows) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  // Tab color by category
  const tabColor = getCategoryTabColor(table.category_id);
  sheet.setTabColor(tabColor);

  if (!cols.length) return;

  // Write header row
  const headers = cols.map(c=>c.name);
  sheet.getRange(1,1,1,headers.length).setValues([headers]);

  // Style header
  const hdrRange = sheet.getRange(1,1,1,headers.length);
  hdrRange.setBackground('#37474f');
  hdrRange.setFontColor('#ffffff');
  hdrRange.setFontWeight('bold');
  hdrRange.setFontSize(10);
  sheet.setFrozenRows(1);

  // Per-column formatting + notes
  cols.forEach((col,i) => {
    const ct   = colTypes.find(t=>String(t.id)===String(col.type_id));
    const des  = ct ? ct.designation.toLowerCase() : 'str';
    const prof = getTypeProfile(des);

    // Column format (rows 2 onward, plenty of rows)
    const colRange = sheet.getRange(2, i+1, Math.max(nRows||3, 100));
    if (prof.fmt && prof.fmt !== 'BOOLEAN') {
      try { colRange.setNumberFormat(prof.fmt); } catch(e) {}
    }

    // Header cell note
    const noteLines = [
      `Тип: ${ct ? ct.name : des}`,
      col.description ? `Описание: ${col.description}` : '',
      isPkCol(col) ? '🔑 Первичный ключ' : '',
      isFkCol(col) ? '🔗 Внешний ключ' : '',
      `Формат: ${prof.fmt}`,
    ].filter(Boolean).join('\n');
    sheet.getRange(1,i+1).setNote(noteLines);

    // Light column bg for type identification (rows 1-200)
    sheet.getRange(1,i+1,1,1).setBackground('#37474f'); // keep header dark
  });

  // Adjust column widths
  sheet.autoResizeColumns(1, headers.length);
  cols.forEach((_,i)=>{const w=sheet.getColumnWidth(i+1);sheet.setColumnWidth(i+1,Math.max(w,80));});

  if (withExamples && nRows>0) _appendExamples(sheet, cols, colTypes, nRows);
}

// ─── Append example rows ─────────────────────────────────────
function _appendExamples(sheet, cols, colTypes, nRows) {
  const startRow = sheet.getLastRow()+1;
  // Generate rows
  const data = [];
  let pkCounter = sheet.getLastRow(); // approximate PK start
  for (let r=0; r<nRows; r++) {
    pkCounter++;
    const row = cols.map(col => {
      const ct  = colTypes.find(t=>String(t.id)===String(col.type_id));
      const des = ct ? ct.designation.toLowerCase() : 'str';
      if (isPkCol(col) || des==='pk') return pkCounter + r;
      if (des==='bool'||des==='boolean') return r%2===0;
      const prof = getTypeProfile(des);
      return prof.ex();
    });
    data.push(row);
  }
  if (!data.length) return;
  const range = sheet.getRange(startRow,1,data.length,cols.length);
  range.setValues(data);

  // Apply formats to example rows
  cols.forEach((col,i)=>{
    const ct  = colTypes.find(t=>String(t.id)===String(col.type_id));
    const des = ct ? ct.designation.toLowerCase() : 'str';
    const prof= getTypeProfile(des);
    if (prof.fmt && prof.fmt!=='BOOLEAN') {
      try { sheet.getRange(startRow,i+1,data.length).setNumberFormat(prof.fmt); } catch(e) {}
    }
  });
}

// ─── Format compatibility check ─────────────────────────────
function _fmtCompatible(actual, expected) {
  if (!expected || expected==='@') return true; // text accepts anything
  const a=(actual||'').toLowerCase(), e=expected.toLowerCase();
  if (a===e) return true;
  if (e.includes('dd')&&a.includes('dd')) return true;    // date family
  if (e.includes('hh')&&a.includes('hh')) return true;    // time family
  if (e==='0'&&(a==='0'||a==='general'||a==='')) return true;
  if (e.startsWith('0.00')&&a.startsWith('0.00')) return true;
  if (e==='boolean'&&a==='boolean') return true;
  if ((a===''||a==='general')&&(e==='@')) return true;
  return false;
}

function isPkCol(col){return isTrue(col.is_pk);}
function isFkCol(col){return isTrue(col.is_fk);}

// ═══════════════════════════════════════════════════════════
// EXPORT SCHEMA TO NEW SPREADSHEET
// ═══════════════════════════════════════════════════════════
//
// Создаёт отдельную Google Таблицу из схемы:
// • Каждая таблица схемы → отдельный лист новой книги
// • Первый лист: README с описанием схемы и таблиц
// • Форматирование, заморозка, цвет вкладок по категории
// • Опционально: примеры данных
// • Возвращает URL новой таблицы
//
function exportToNewSpreadsheet(payload) {
  const {
    schema_id,
    title,         // название новой книги (опционально)
    with_examples, // добавить примеры данных
    example_rows,  // кол-во примеров
    folder_name,   // имя папки в My Drive (опционально)
  } = payload;

  const nRows = parseInt(example_rows) || 3;
  const { schema, tables, allCols, colTypes, cats } = _getSchemaData(schema_id);

  // ── 1. Создать новую книгу ───────────────────────────────
  const bookTitle = (title || schema.name || 'Схема БД') + ' — ' +
    Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd.MM.yyyy');

  const newSS = SpreadsheetApp.create(bookTitle);
  const fileId = newSS.getId();

  // ── 2. README лист (переименовываем первый) ──────────────
  const readmeSheet = newSS.getActiveSheet();
  readmeSheet.setName('📋 README');
  _buildReadme(readmeSheet, schema, tables, allCols, colTypes, cats);

  // ── 3. Лист для каждой таблицы схемы ────────────────────
  const sortedTables = tables.slice().sort((a, b) => {
    // Сначала справочники, потом шапки, детали, транзакции
    const catOrder = (t) => {
      const cat = cats.find(c => String(c.id) === String(t.category_id));
      if (!cat) return 9;
      const n = cat.name.toLowerCase();
      if (n.includes('справочн')) return 1;
      if (n.includes('шапк'))     return 2;
      if (n.includes('детал'))    return 3;
      if (n.includes('транзакц')) return 4;
      return 5;
    };
    return catOrder(a) - catOrder(b) || a.name.localeCompare(b.name);
  });

  sortedTables.forEach(table => {
    const cols = allCols
      .filter(c => String(c.table_id) === String(table.id))
      .sort((a, b) => Number(a.position) - Number(b.position));

    const sheet = newSS.insertSheet(table.name);
    sheet.setTabColor(getCategoryTabColor(table.category_id));

    if (cols.length > 0) {
      _formatSheet(sheet, table, cols, colTypes, cats, with_examples, nRows);
    }
  });

  // ── 4. Лист «🗺 Связи» ─────────────────────────────────
  _buildRelationsSheet(newSS, tables, allCols, colTypes);

  // ── 5. Переместить в папку (если указана) ───────────────
  let folderUrl = null;
  if (folder_name) {
    try {
      const file = DriveApp.getFileById(fileId);
      const results = DriveApp.getFoldersByName(folder_name);
      if (results.hasNext()) {
        const folder = results.next();
        folder.addFile(file);
        DriveApp.getRootFolder().removeFile(file);
        folderUrl = folder.getUrl();
      }
    } catch(e) { /* не критично — файл останется в корне */ }
  }

  // ── 6. Поделиться с текущим пользователем (Editor) ──────
  try {
    const email = Session.getActiveUser().getEmail();
    if (email) newSS.addEditor(email);
  } catch(e) {}

  return {
    url:        newSS.getUrl(),
    title:      bookTitle,
    spreadsheet_id: fileId,
    tables_count:   tables.length,
    folder_url: folderUrl,
  };
}

// ── README лист ──────────────────────────────────────────────
function _buildReadme(sheet, schema, tables, allCols, colTypes, cats) {
  const now = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd.MM.yyyy HH:mm');

  // Заголовок
  sheet.getRange('A1').setValue('📊 ' + schema.name);
  sheet.getRange('A1').setFontSize(18).setFontWeight('bold').setFontColor('#1a237e');

  sheet.getRange('A2').setValue('Схема базы данных · Создана: ' + now);
  sheet.getRange('A2').setFontSize(10).setFontColor('#546e7a');

  if (schema.description) {
    sheet.getRange('A3').setValue(schema.description);
    sheet.getRange('A3').setFontColor('#37474f').setFontSize(11);
  }

  sheet.getRange('A4').setValue('');

  // Заголовок таблицы
  const HDR = ['Таблица', 'Категория', 'Столбцов', 'PK', 'FK', 'Описание'];
  sheet.getRange(5, 1, 1, HDR.length).setValues([HDR]);
  const hdrRange = sheet.getRange(5, 1, 1, HDR.length);
  hdrRange.setBackground('#1a237e').setFontColor('#ffffff').setFontWeight('bold').setFontSize(10);
  sheet.setFrozenRows(5);

  // Строки таблиц
  tables.forEach((t, i) => {
    const cols     = allCols.filter(c => String(c.table_id) === String(t.id));
    const cat      = cats.find(c => String(c.id) === String(t.category_id));
    const pkCnt    = cols.filter(isPkCol).length;
    const fkCnt    = cols.filter(isFkCol).length;
    const row      = [t.name, cat ? cat.name : '—', cols.length, pkCnt, fkCnt, t.description || ''];
    const r        = sheet.getRange(6 + i, 1, 1, row.length);
    r.setValues([row]);
    if (i % 2 === 0) r.setBackground('#e8eaf6');
    // Цветная точка категории
    sheet.getRange(6 + i, 1).setFontColor('#1565c0').setFontWeight('600');
  });

  // После таблицы — легенда типов
  const legendRow = 7 + tables.length;
  sheet.getRange(legendRow, 1).setValue('Типы данных:').setFontWeight('bold').setFontSize(10).setFontColor('#37474f');
  const typeMap = {};
  allCols.forEach(c => {
    const ct = colTypes.find(t => String(t.id) === String(c.type_id));
    if (ct && !typeMap[ct.designation]) typeMap[ct.designation] = ct.name;
  });
  Object.entries(typeMap).forEach(([des, name], i) => {
    sheet.getRange(legendRow + 1 + Math.floor(i / 3), 1 + (i % 3) * 2)
      .setValue(des.toUpperCase() + ' — ' + name).setFontSize(9).setFontColor('#546e7a');
  });

  // Ширина столбцов
  sheet.setColumnWidth(1, 160);
  sheet.setColumnWidth(2, 120);
  sheet.setColumnWidth(3, 70);
  sheet.setColumnWidth(4, 50);
  sheet.setColumnWidth(5, 50);
  sheet.setColumnWidth(6, 300);
}

// ── Лист связей ──────────────────────────────────────────────
function _buildRelationsSheet(ss, tables, allCols, colTypes) {
  const fkCols = allCols.filter(isFkCol).filter(c => c.fk_table_id && c.fk_column_id);
  if (!fkCols.length) return;

  const sheet = ss.insertSheet('🔗 Связи');
  sheet.setTabColor('#e91e63');

  const HDR = ['FK таблица', 'FK колонка', 'Тип FK', '→', 'PK таблица', 'PK колонка'];
  sheet.getRange(1, 1, 1, HDR.length).setValues([HDR]);
  sheet.getRange(1, 1, 1, HDR.length)
    .setBackground('#880e4f').setFontColor('#ffffff').setFontWeight('bold').setFontSize(10);
  sheet.setFrozenRows(1);

  fkCols.forEach((col, i) => {
    const srcT  = tables.find(t => String(t.id) === String(col.table_id));
    const tgtT  = tables.find(t => String(t.id) === String(col.fk_table_id));
    const tgtC  = allCols.find(c => String(c.id) === String(col.fk_column_id));
    const ct    = colTypes.find(t => String(t.id) === String(col.type_id));

    const row = [
      srcT  ? srcT.name  : String(col.table_id),
      col.name,
      ct    ? ct.name    : 'fk',
      '→',
      tgtT  ? tgtT.name  : String(col.fk_table_id),
      tgtC  ? tgtC.name  : String(col.fk_column_id),
    ];
    const r = sheet.getRange(2 + i, 1, 1, row.length);
    r.setValues([row]);
    if (i % 2 === 0) r.setBackground('#fce4ec');
    sheet.getRange(2 + i, 4).setFontColor('#e91e63').setFontWeight('bold');
  });

  sheet.setColumnWidth(1, 150); sheet.setColumnWidth(2, 150);
  sheet.setColumnWidth(3, 100); sheet.setColumnWidth(4, 40);
  sheet.setColumnWidth(5, 150); sheet.setColumnWidth(6, 150);
}

// ─── Register handlers in Backend processRequest ─────────────
// Add these to the handlers object in processRequest:
//   createSchemaTables:       () => createSchemaTables(payload),
//   createSchemaTable:        () => createSchemaTable(payload),
//   deleteSchemaSheet:        () => deleteSchemaSheet(payload),
//   deleteSheetColumn:        () => deleteSheetColumn(payload),
//   addExampleData:           () => addExampleData(payload),
//   analyseSchema:            () => analyseSchema(payload),
//   getSheetData:             () => getSheetData(payload),
//   listSheets:               () => listSheets(payload),
//   exportToNewSpreadsheet:   () => exportToNewSpreadsheet(payload),