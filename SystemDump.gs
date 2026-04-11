// ─── Full system dump (for AI context) ───────────────────────
function getSystemDump(p) {
  return {
    categories:  _allRows(SHEETS.CATEGORIES),
    assignments: _allRows(SHEETS.ASSIGNMENTS),
    col_types:   _allRows(SHEETS.COL_TYPES),
    schemas:     _allRows(SHEETS.SCHEMAS),
    tables:      _allRows(SHEETS.TABLES),
    columns:     _allRows(SHEETS.COLUMNS),
    templates:   _allRows(SHEETS.TEMPLATES),
    template_cols: _allRows(SHEETS.TEMPLATE_COLS),
  };
}
