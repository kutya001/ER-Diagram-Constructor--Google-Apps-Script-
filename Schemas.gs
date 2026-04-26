// ============================================================
// Schemas.gs — CRUD схем БД
// ============================================================
// Зависит: Utils.gs (_sheet, _allRows, _nextId, _appendRow, _updateRow, _deleteRow, _batchDeleteWhere)
//          Backend.gs (SHEETS)
//          Tables.gs (getTablesBySchema)
//          Columns.gs (getColumnsByTable)
// ============================================================

const SCHEMA_HEADERS = ['id','name','description','copied_from','pos_x','pos_y','create_date_time','update_date_time'];

function createSchema(p) {
  Logger.log('createSchema: ' + JSON.stringify(p));
  const now = new Date().toISOString();
  const obj = { id: _nextId(SHEETS.SCHEMAS), name: p.name || 'Новая схема', description: p.description || '',
    copied_from: '', pos_x: p.pos_x || 0, pos_y: p.pos_y || 0, create_date_time: now, update_date_time: now };
  return _appendRow(SHEETS.SCHEMAS, obj, SCHEMA_HEADERS);
}

function updateSchema(p) {
  return _updateRow(SHEETS.SCHEMAS, p.id, p, SCHEMA_HEADERS);
}

function deleteSchema(p) {
  Logger.log('deleteSchema: id=' + p.id);
  const allTables  = _allRows(SHEETS.TABLES);
  const allColumns = _allRows(SHEETS.COLUMNS);
  const schemaId   = String(p.id);
  const tblIds     = new Set(allTables.filter(t=>String(t.schema_id)===schemaId).map(t=>String(t.id)));
  _batchDeleteWhere(SHEETS.COLUMNS, r => tblIds.has(String(r.table_id)));
  _batchDeleteWhere(SHEETS.TABLES, r => String(r.schema_id)===schemaId);
  return _deleteRow(SHEETS.SCHEMAS, p.id);
}

function copySchema(p) {
  const now = new Date().toISOString();
  const src = _allRows(SHEETS.SCHEMAS).find(s => String(s.id) === String(p.id));
  if (!src) throw new Error('Schema not found');

  const newSchemaId = _nextId(SHEETS.SCHEMAS);
  const newSchema = { 
    id: newSchemaId, 
    name: src.name + ' (копия)', 
    description: src.description,
    copied_from: src.id, 
    pos_x: (src.pos_x || 0) + 20, 
    pos_y: (src.pos_y || 0) + 20,
    create_date_time: now, 
    update_date_time: now 
  };
  _appendRow(SHEETS.SCHEMAS, newSchema, SCHEMA_HEADERS);

  const srcTables = getTablesBySchema({ schema_id: p.id });
  if (!srcTables.length) return newSchema;

  const tblSh = _sheet(SHEETS.TABLES);
  const colSh = _sheet(SHEETS.COLUMNS);
  let tblIdCounter = _nextId(SHEETS.TABLES);
  let colIdCounter = _nextId(SHEETS.COLUMNS);

  const tableIdMap = {};
  const colIdMap   = {};

  // 1. Подготовка строк таблиц
  const tblRows = srcTables.map(t => {
    const newId = tblIdCounter++;
    tableIdMap[String(t.id)] = newId;
    const obj = {
      ...t,
      id: newId,
      schema_id: newSchemaId,
      create_date_time: now,
      update_date_time: now
    };
    return TABLE_HEADERS.map(h => obj[h] !== undefined ? obj[h] : '');
  });

  // 2. Подготовка строк колонок
  const colRows = [];
  const fkNeeds = [];
  
  srcTables.forEach(t => {
    const cols = getColumnsByTable({ table_id: t.id });
    const newTableId = tableIdMap[String(t.id)];
    
    cols.forEach(c => {
      const newCId = colIdCounter++;
      colIdMap[String(c.id)] = newCId;
      
      const obj = {
        ...c,
        id: newCId,
        table_id: newTableId,
        fk_table_id: '', 
        fk_column_id: '',
        create_date_time: now,
        update_date_time: now
      };
      
      const rowIdx = colRows.length;
      colRows.push(COL_HEADERS.map(h => obj[h] !== undefined ? obj[h] : ''));
      
      // ИСПРАВЛЕНИЕ: Безопасная проверка boolean/строки без вызова isTrue()
      const isFk = (c.is_fk === true || String(c.is_fk).toLowerCase() === 'true' || c.is_fk === 1);
      
      if (isFk && c.fk_table_id) {
        fkNeeds.push({
          rowIdx: rowIdx,
          fkTableId: String(c.fk_table_id),
          fkColId: String(c.fk_column_id || '')
        });
      }
    });
  });

  // 3. Восстановление связей (FK)
  const fkTableIdx = COL_HEADERS.indexOf('fk_table_id');
  const fkColIdx = COL_HEADERS.indexOf('fk_column_id');
  fkNeeds.forEach(({rowIdx, fkTableId, fkColId}) => {
    const newTId = tableIdMap[fkTableId] || '';
    const newCId = colIdMap[fkColId] || '';
    if (fkTableIdx !== -1) colRows[rowIdx][fkTableIdx] = newTId;
    if (fkColIdx !== -1) colRows[rowIdx][fkColIdx] = newCId;
  });

  // 4. Пакетная вставка с динамическим расширением листов (защита от Out of Bounds)
  if (tblRows.length) {
    const numCols = tblRows[0].length;
    if (tblSh.getMaxColumns() < numCols) {
      tblSh.insertColumnsAfter(tblSh.getMaxColumns(), numCols - tblSh.getMaxColumns());
    }
    const startT = tblSh.getLastRow() + 1;
    const neededRows = startT + tblRows.length - 1;
    if (tblSh.getMaxRows() < neededRows) {
      tblSh.insertRowsAfter(tblSh.getMaxRows(), neededRows - tblSh.getMaxRows());
    }
    tblSh.getRange(startT, 1, tblRows.length, numCols).setValues(tblRows);
  }
  
  if (colRows.length) {
    const numCols = colRows[0].length;
    if (colSh.getMaxColumns() < numCols) {
      colSh.insertColumnsAfter(colSh.getMaxColumns(), numCols - colSh.getMaxColumns());
    }
    const startC = colSh.getLastRow() + 1;
    const neededRows = startC + colRows.length - 1;
    if (colSh.getMaxRows() < neededRows) {
      colSh.insertRowsAfter(colSh.getMaxRows(), neededRows - colSh.getMaxRows());
    }
    colSh.getRange(startC, 1, colRows.length, numCols).setValues(colRows);
  }
  
  return newSchema;
}

function detachSchema(p) {
  return _updateRow(SHEETS.SCHEMAS, p.id, { copied_from: '' }, SCHEMA_HEADERS);
}
