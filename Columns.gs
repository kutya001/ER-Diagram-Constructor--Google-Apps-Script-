// ─── Columns ─────────────────────────────────────────────────
const COL_HEADERS = ['id','table_id','name','description','type_id','is_pk','is_fk','fk_table_id','fk_column_id','position','create_date_time','update_date_time'];

function getColumnsByTable(p) {
  return _allRows(SHEETS.COLUMNS)
    .filter(c => String(c.table_id) === String(p.table_id))
    .sort((a, b) => Number(a.position) - Number(b.position));
}

function createColumn(p) {
  const now = new Date().toISOString();
  const tableCols = getColumnsByTable({ table_id: p.table_id });
  const maxPos = tableCols.length ? Math.max(...tableCols.map(c => Number(c.position) || 0)) : 0;
  // Валидация FK-цели
  if (isTrue(p.is_fk)) validateFkTarget(p.fk_table_id, p.fk_column_id);
  const obj = { id: _nextId(SHEETS.COLUMNS), table_id: p.table_id, name: p.name || 'column',
    description: p.description || '', type_id: p.type_id || '', is_pk: p.is_pk || false,
    is_fk: p.is_fk || false, fk_table_id: p.fk_table_id || '', fk_column_id: p.fk_column_id || '',
    position: p.position !== undefined ? p.position : maxPos + 1,
    create_date_time: now, update_date_time: now };
  return _appendRow(SHEETS.COLUMNS, obj, COL_HEADERS);
}

function updateColumn(p) {
  // Валидация FK-цели при изменении
  if (isTrue(p.is_fk)) validateFkTarget(p.fk_table_id, p.fk_column_id);
  return _updateRow(SHEETS.COLUMNS, p.id, p, COL_HEADERS);
}

function deleteColumn(p) {
  return _deleteRow(SHEETS.COLUMNS, p.id);
}

function reorderColumns(p) {
  // p.order = [{id, position}]
  p.order.forEach(item => _updateRow(SHEETS.COLUMNS, item.id, { position: item.position }, COL_HEADERS));
  return true;
}
