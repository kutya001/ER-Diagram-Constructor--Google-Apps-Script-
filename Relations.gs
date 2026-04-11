// ─── Relations (stored as FK columns) ────────────────────────
function createRelation(p) {
  // p: { fk_column_id, fk_table_id, pk_column_id }
  validateFkTarget(p.pk_table_id, p.pk_column_id);
  return _updateRow(SHEETS.COLUMNS, p.fk_column_id,
    { is_fk: true, fk_table_id: p.pk_table_id, fk_column_id: p.pk_column_id }, COL_HEADERS);
}

function deleteRelation(p) {
  return _updateRow(SHEETS.COLUMNS, p.fk_column_id,
    { is_fk: false, fk_table_id: '', fk_column_id: '' }, COL_HEADERS);
}
