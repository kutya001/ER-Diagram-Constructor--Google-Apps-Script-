// ─── Tables ──────────────────────────────────────────────────
const TABLE_HEADERS = ['id','schema_id','name','description','note','category_id','assignment_id','pos_x','pos_y','create_date_time','update_date_time'];

function getTablesBySchema(p) {
  return _allRows(SHEETS.TABLES).filter(t => String(t.schema_id) === String(p.schema_id));
}

function createTable(p) {
  const now = new Date().toISOString();
  const obj = { id: _nextId(SHEETS.TABLES), schema_id: p.schema_id, name: p.name || 'Новая таблица',
    description: p.description || '', note: p.note || '', category_id: p.category_id || '', assignment_id: p.assignment_id || '',
    pos_x: p.pos_x || 100, pos_y: p.pos_y || 100, create_date_time: now, update_date_time: now };
  return _appendRow(SHEETS.TABLES, obj, TABLE_HEADERS);
}

function updateTable(p) {
  return _updateRow(SHEETS.TABLES, p.id, p, TABLE_HEADERS);
}

function deleteTable(p) {
  // 1. Delete all columns of this table
  _batchDeleteWhere(SHEETS.COLUMNS, r => String(r.table_id) === String(p.id));
  
  // 2. Clear all FK references to this table in other tables
  const dependentCols = _allRows(SHEETS.COLUMNS).filter(c => String(c.fk_table_id) === String(p.id));
  dependentCols.forEach(c => {
    _updateRow(SHEETS.COLUMNS, c.id, { is_fk: false, fk_table_id: '', fk_column_id: '' }, COL_HEADERS);
  });

  // 3. Delete the table itself
  return _deleteRow(SHEETS.TABLES, p.id);
}

function copyTable(p) {
  const src = _allRows(SHEETS.TABLES).find(t => String(t.id) === String(p.id));
  if (!src) throw new Error('Table not found');
  const newT = createTable({ ...src, name: src.name + ' (копия)', pos_x: (src.pos_x || 0) + 30, pos_y: (src.pos_y || 0) + 30 });
  const cols = getColumnsByTable({ table_id: p.id });
  cols.forEach(c => createColumn({ ...c, table_id: newT.id }));
  return newT;
}
