// ============================================================
// Backend.gs — ER Diagram Constructor (Google Apps Script)
// Точка входа: doGet, initSheets, диспетчер запросов
// ============================================================

// ─── Sheet names ────────────────────────────────────────────
const SHEETS = {
  CATEGORIES:      'Категории таблиц',
  ASSIGNMENTS:     'Назначение таблиц',
  COL_TYPES:       'Типы колонок',
  SCHEMAS:         'Схемы Баз данных',
  TABLES:          'Таблицы',
  COLUMNS:         'Столбцы Таблиц',
  TEMPLATES:       'Шаблоны таблиц',
  TEMPLATE_COLS:   'Столбцы шаблонов',
};

// ─── Entry point ────────────────────────────────────────────
function doGet() {
  initSheets();
  return HtmlService.createTemplateFromFile('Frontend').evaluate()
    .setTitle('ER Diagram Constructor')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

// ─── Sheet initialisation ───────────────────────────────────
function initSheets() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  const defs = {
    [SHEETS.CATEGORIES]:    ['id','name','description','create_date_time','update_date_time'],
    [SHEETS.ASSIGNMENTS]:   ['id','name','description','create_date_time','update_date_time'],
    [SHEETS.COL_TYPES]:     ['id','name','designation','description','create_date_time','update_date_time'],
    [SHEETS.SCHEMAS]:       ['id','name','description','copied_from','pos_x','pos_y','create_date_time','update_date_time'],
    [SHEETS.TABLES]:        ['id','schema_id','name','description','category_id','assignment_id','pos_x','pos_y','create_date_time','update_date_time'],
    [SHEETS.COLUMNS]:       ['id','table_id','name','description','type_id','is_pk','is_fk','fk_table_id','fk_column_id','position','create_date_time','update_date_time'],
    [SHEETS.TEMPLATES]:     ['id','name','category_id','description','create_date_time','update_date_time'],
    [SHEETS.TEMPLATE_COLS]: ['id','template_id','name','description','type_id','is_pk','is_fk','position','create_date_time','update_date_time'],
  };

  Object.entries(defs).forEach(([sheetName, headers]) => {
    let sheet = ss.getSheetByName(sheetName);
    if (!sheet) {
      sheet = ss.insertSheet(sheetName);
      sheet.appendRow(headers);
      sheet.setFrozenRows(1);
      sheet.getRange(1, 1, 1, headers.length)
        .setBackground('#4a90d9').setFontColor('#ffffff').setFontWeight('bold');
    }
  });

  _seedDefaults(ss);
}

// ─── Batch endpoint ──────────────────────────────────────────
function processBatch(requests) {
  Logger.log('processBatch: ' + (requests || []).length + ' запросов');
  try {
    const results = requests.map(req => {
      try {
        const r = processRequest(req.action, req.payload || {});
        return r;
      } catch(e) {
        return { ok: false, error: e.message };
      }
    });
    return { ok: true, data: results };
  } catch(e) {
    return { ok: false, error: e.message };
  }
}

// ─── loadAll in one batch ─────────────────────────────────────
function loadAllData() {
  const requests = [
    { action: 'getSchemas' },
    { action: 'getCategories' },
    { action: 'getAssignments' },
    { action: 'getColumnTypes' },
    { action: 'getTables' },
    { action: 'getColumns' },
    { action: 'getTemplates' },
    { action: 'getAllTemplateColumns' },
  ];
  return processBatch(requests);
}

// ─── API dispatcher ──────────────────────────────────────────
function processRequest(action, payload) {
  try {
    Logger.log('processRequest: ' + action + ' ' + JSON.stringify(payload || {}).substring(0, 200));
    const handlers = {
      // ── Lookup data ──
      getCategories:   () => _allRows(SHEETS.CATEGORIES),
      getAssignments:  () => _allRows(SHEETS.ASSIGNMENTS),
      getColumnTypes:  () => _allRows(SHEETS.COL_TYPES),

      // ── Schemas ──
      getSchemas:      () => _allRows(SHEETS.SCHEMAS),
      createSchema:    () => createSchema(payload),
      updateSchema:    () => updateSchema(payload),
      deleteSchema:    () => deleteSchema(payload),
      copySchema:      () => copySchema(payload),
      detachSchema:    () => detachSchema(payload),

      // ── Tables ──
      getTables:       () => _allRows(SHEETS.TABLES),
      getTablesBySchema: () => getTablesBySchema(payload),
      createTable:     () => createTable(payload),
      updateTable:     () => updateTable(payload),
      deleteTable:     () => deleteTable(payload),
      copyTable:       () => copyTable(payload),

      // ── Columns ──
      getColumns:      () => _allRows(SHEETS.COLUMNS),
      getColumnsByTable: () => getColumnsByTable(payload),
      createColumn:    () => createColumn(payload),
      updateColumn:    () => updateColumn(payload),
      deleteColumn:    () => deleteColumn(payload),
      reorderColumns:  () => reorderColumns(payload),

      // ── Relations ──
      createRelation:  () => createRelation(payload),
      deleteRelation:  () => deleteRelation(payload),

      // ── Templates ──
      getTemplates:          () => _allRows(SHEETS.TEMPLATES),
      getTemplateColumns:    () => getTemplateColumns(payload),
      getAllTemplateColumns:  () => _allRows(SHEETS.TEMPLATE_COLS),
      createTemplate:        () => createTemplate(payload),
      updateTemplate:        () => updateTemplate(payload),
      deleteTemplate:        () => deleteTemplate(payload),
      createTemplateColumn:  () => createTemplateColumn(payload),
      updateTemplateColumn:  () => updateTemplateColumn(payload),
      deleteTemplateColumn:  () => deleteTemplateColumn(payload),
      reorderTemplateColumns:() => reorderTemplateColumns(payload),
      applyTemplate:         () => applyTemplate(payload),
      getTemplatesForCategory: () => getTemplatesForCategory(payload),
      createTableWithTemplate: () => createTableWithTemplate(payload),

      // ── System tables CRUD ──
      createColumnType:      () => createColumnType(payload),
      updateColumnType:      () => updateColumnType(payload),
      deleteColumnType:      () => deleteColumnType(payload),

      createCategory:        () => createCategoryItem(payload),
      updateCategory:        () => updateCategoryItem(payload),
      deleteCategory:        () => deleteCategoryItem(payload),

      createAssignment:      () => createAssignmentItem(payload),
      updateAssignment:      () => updateAssignmentItem(payload),
      deleteAssignment:      () => deleteAssignmentItem(payload),

      // ── JSON export / import ──
      exportSchemaJson:      () => exportSchemaJson(payload),
      importSchemaJson:      () => importSchemaJson(payload),
      getSystemDump:         () => getSystemDump(payload),

      // ── Instruction ──
      getInstruction:        () => getInstruction(payload),
      saveInstruction:       () => saveInstruction(payload),

      // ── Sheet builder (CreateTables.gs) ──
      createSchemaTables:    () => createSchemaTables(payload),
      createSchemaTable:     () => createSchemaTable(payload),
      deleteSchemaSheet:     () => deleteSchemaSheet(payload),
      deleteSheetColumn:     () => deleteSheetColumn(payload),
      addExampleData:        () => addExampleData(payload),
      analyseSchema:         () => analyseSchema(payload),
      getSheetData:          () => getSheetData(payload),
      listSheets:            () => listSheets(payload),
      exportToNewSpreadsheet:() => exportToNewSpreadsheet(payload),
    };

    if (!handlers[action]) throw new Error('Unknown action: ' + action);
    return { ok: true, data: handlers[action]() };
  } catch (e) {
    Logger.log('ERROR processRequest ' + action + ': ' + e.message);
    return { ok: false, error: e.message };
  }
}
