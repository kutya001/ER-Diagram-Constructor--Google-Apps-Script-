// ─── Categories / Assignments CRUD ───────────────────────────
const CAT_HEADERS = ['id','name','description','create_date_time','update_date_time'];
const ASG_HEADERS = ['id','name','description','create_date_time','update_date_time'];

// ─── System tables: Column Types CRUD ────────────────────────
const CT_HEADERS = ['id','name','designation','description','create_date_time','update_date_time'];

function createColumnType(p) {
  const now = new Date().toISOString();
  if (!p.name || !p.designation) throw new Error('Название и обозначение обязательны');
  const existing = _allRows(SHEETS.COL_TYPES);
  if (existing.find(r => r.designation === p.designation)) throw new Error('Обозначение уже используется: ' + p.designation);
  const obj = { id: _nextId(SHEETS.COL_TYPES), name: p.name, designation: p.designation,
    description: p.description || '', create_date_time: now, update_date_time: now };
  return _appendRow(SHEETS.COL_TYPES, obj, CT_HEADERS);
}

function updateColumnType(p) {
  if (!p.name || !p.designation) throw new Error('Название и обозначение обязательны');
  const existing = _allRows(SHEETS.COL_TYPES);
  const dup = existing.find(r => r.designation === p.designation && String(r.id) !== String(p.id));
  if (dup) throw new Error('Обозначение уже используется: ' + p.designation);
  return _updateRow(SHEETS.COL_TYPES, p.id, p, CT_HEADERS);
}

function deleteColumnType(p) {
  // Check if used by any column
  const used = _allRows(SHEETS.COLUMNS).find(c => String(c.type_id) === String(p.id));
  if (used) throw new Error('Тип используется в колонках таблиц — удаление невозможно');
  const usedTpl = _allRows(SHEETS.TEMPLATE_COLS).find(c => String(c.type_id) === String(p.id));
  if (usedTpl) throw new Error('Тип используется в шаблонах — удаление невозможно');
  return _deleteRow(SHEETS.COL_TYPES, p.id);
}

// ─── System tables: Categories CRUD ──────────────────────────
function createCategoryItem(p) {
  const now = new Date().toISOString();
  if (!p.name) throw new Error('Название обязательно');
  const obj = { id: _nextId(SHEETS.CATEGORIES), name: p.name, description: p.description || '',
    create_date_time: now, update_date_time: now };
  return _appendRow(SHEETS.CATEGORIES, obj, CAT_HEADERS);
}

function updateCategoryItem(p) {
  if (!p.name) throw new Error('Название обязательно');
  return _updateRow(SHEETS.CATEGORIES, p.id, p, CAT_HEADERS);
}

function deleteCategoryItem(p) {
  const used = _allRows(SHEETS.TABLES).find(t => String(t.category_id) === String(p.id));
  if (used) throw new Error('Категория используется в таблицах — удаление невозможно');
  return _deleteRow(SHEETS.CATEGORIES, p.id);
}

// ─── System tables: Assignments CRUD ─────────────────────────
function createAssignmentItem(p) {
  const now = new Date().toISOString();
  if (!p.name) throw new Error('Название обязательно');
  const obj = { id: _nextId(SHEETS.ASSIGNMENTS), name: p.name, description: p.description || '',
    create_date_time: now, update_date_time: now };
  return _appendRow(SHEETS.ASSIGNMENTS, obj, ASG_HEADERS);
}

function updateAssignmentItem(p) {
  if (!p.name) throw new Error('Название обязательно');
  return _updateRow(SHEETS.ASSIGNMENTS, p.id, p, ASG_HEADERS);
}

function deleteAssignmentItem(p) {
  const used = _allRows(SHEETS.TABLES).find(t => String(t.assignment_id) === String(p.id));
  if (used) throw new Error('Назначение используется в таблицах — удаление невозможно');
  return _deleteRow(SHEETS.ASSIGNMENTS, p.id);
}
