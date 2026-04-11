// ─── Templates ───────────────────────────────────────────────
const TPL_HEADERS  = ['id','name','category_id','description','create_date_time','update_date_time'];
const TCOL_HEADERS = ['id','template_id','name','description','type_id','is_pk','is_fk','position','create_date_time','update_date_time'];

function getTemplateColumns(p) {
  return _allRows(SHEETS.TEMPLATE_COLS)
    .filter(c => String(c.template_id) === String(p.template_id))
    .sort((a, b) => Number(a.position) - Number(b.position));
}

function createTemplate(p) {
  const now = new Date().toISOString();
  const obj = { id: _nextId(SHEETS.TEMPLATES), name: p.name || 'Новый шаблон',
    category_id: p.category_id || '', description: p.description || '',
    create_date_time: now, update_date_time: now };
  return _appendRow(SHEETS.TEMPLATES, obj, TPL_HEADERS);
}

function updateTemplate(p) {
  return _updateRow(SHEETS.TEMPLATES, p.id, p, TPL_HEADERS);
}

function deleteTemplate(p) {
  // cascade delete template columns
  const cols = getTemplateColumns({ template_id: p.id });
  cols.forEach(c => _deleteRow(SHEETS.TEMPLATE_COLS, c.id));
  return _deleteRow(SHEETS.TEMPLATES, p.id);
}

function createTemplateColumn(p) {
  const now = new Date().toISOString();
  const existing = getTemplateColumns({ template_id: p.template_id });
  const maxPos = existing.length ? Math.max(...existing.map(c => Number(c.position)||0)) : 0;
  const obj = { id: _nextId(SHEETS.TEMPLATE_COLS), template_id: p.template_id,
    name: p.name || 'column', description: p.description || '',
    type_id: p.type_id || '', is_pk: p.is_pk || false, is_fk: p.is_fk || false,
    position: p.position !== undefined ? p.position : maxPos + 1,
    create_date_time: now, update_date_time: now };
  return _appendRow(SHEETS.TEMPLATE_COLS, obj, TCOL_HEADERS);
}

function updateTemplateColumn(p) {
  return _updateRow(SHEETS.TEMPLATE_COLS, p.id, p, TCOL_HEADERS);
}

function deleteTemplateColumn(p) {
  return _deleteRow(SHEETS.TEMPLATE_COLS, p.id);
}

function reorderTemplateColumns(p) {
  p.order.forEach(item => _updateRow(SHEETS.TEMPLATE_COLS, item.id, { position: item.position }, TCOL_HEADERS));
  return true;
}

/**
 * Apply a template to an existing table.
 * Only columns that don't already exist (by name) will be added.
 * p: { table_id, template_id }
 */
function applyTemplate(p) {
  const tplCols = getTemplateColumns({ template_id: p.template_id });
  const existingCols = getColumnsByTable({ table_id: p.table_id });
  const existingNames = new Set(existingCols.map(c => c.name.toLowerCase()));
  const added = [];
  tplCols.forEach(tc => {
    if (!existingNames.has(String(tc.name).toLowerCase())) {
      const newCol = createColumn({
        table_id:    p.table_id,
        name:        tc.name,
        description: tc.description,
        type_id:     tc.type_id,
        is_pk:       tc.is_pk,
        is_fk:       tc.is_fk,
      });
      added.push(newCol);
    }
  });
  return added;
}

/**
 * Get templates applicable to a given category_id:
 * returns templates where category_id matches OR category_id is empty (universal).
 */
function getTemplatesForCategory(p) {
  return _allRows(SHEETS.TEMPLATES).filter(t =>
    !t.category_id || String(t.category_id) === String(p.category_id)
  );
}

/**
 * Create table and immediately apply all matching templates.
 * p: { schema_id, name, description, category_id, assignment_id, pos_x, pos_y, apply_templates }
 * Returns { table, addedColumns }
 */
function createTableWithTemplate(p) {
  const table = createTable(p);
  let addedColumns = [];
  if (p.apply_templates && p.category_id) {
    const matchingTemplates = getTemplatesForCategory({ category_id: p.category_id });
    matchingTemplates.forEach(tpl => {
      const cols = applyTemplate({ table_id: table.id, template_id: tpl.id });
      addedColumns = addedColumns.concat(cols);
    });
  }
  return { table, addedColumns };
}
