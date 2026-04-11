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
  const newSchema = { id: _nextId(SHEETS.SCHEMAS), name: src.name + ' (копия)', description: src.description,
    copied_from: src.id, pos_x: (src.pos_x || 0) + 20, pos_y: (src.pos_y || 0) + 20,
    create_date_time: now, update_date_time: now };
  _appendRow(SHEETS.SCHEMAS, newSchema, SCHEMA_HEADERS);

  const srcTables = getTablesBySchema({ schema_id: p.id });
  if (!srcTables.length) return newSchema;

  const tblSh = _sheet(SHEETS.TABLES);
  const colSh = _sheet(SHEETS.COLUMNS);
  let tblId = _nextId(SHEETS.TABLES);
  let colId = _nextId(SHEETS.COLUMNS);

  const tableIdMap = {};
  const colIdMap   = {};

  const tblRows = srcTables.map(t => {
    const newId = tblId++;
    tableIdMap[String(t.id)] = newId;
    return [newId, newSchema.id, t.name, t.description||'', t.category_id||'', t.assignment_id||'',
            t.pos_x||100, t.pos_y||100, now, now];
  });

  const colRows = [];
  const fkNeeds = [];
  srcTables.forEach(t => {
    const cols = getColumnsByTable({ table_id: t.id });
    const newTableId = tableIdMap[String(t.id)];
    cols.forEach(c => {
      const newCId = colId++;
      colIdMap[String(c.id)] = newCId;
      colRows.push([newCId, newTableId, c.name, c.description||'', c.type_id||'',
                    c.is_pk, c.is_fk, '', '', c.position||1, now, now]);
      if(c.is_fk && c.fk_table_id){
        fkNeeds.push({rowIdx:colRows.length-1, fkTableId:String(c.fk_table_id), fkColId:String(c.fk_column_id||'')});
      }
    });
  });

  fkNeeds.forEach(({rowIdx,fkTableId,fkColId})=>{
    const newTId = tableIdMap[fkTableId] || '';
    const newCId = colIdMap[fkColId] || '';
    colRows[rowIdx][7] = newTId;
    colRows[rowIdx][8] = newCId;
  });

  if(tblRows.length){
    const startT = tblSh.getLastRow()+1;
    tblSh.getRange(startT,1,tblRows.length,tblRows[0].length).setValues(tblRows);
  }
  if(colRows.length){
    const startC = colSh.getLastRow()+1;
    colSh.getRange(startC,1,colRows.length,colRows[0].length).setValues(colRows);
  }
  return newSchema;
}

function detachSchema(p) {
  return _updateRow(SHEETS.SCHEMAS, p.id, { copied_from: '' }, SCHEMA_HEADERS);
}
