// ─── JSON Export ──────────────────────────────────────────────
function exportSchemaJson(p) {
  const schema = _allRows(SHEETS.SCHEMAS).find(s => String(s.id) === String(p.schema_id));
  if (!schema) throw new Error('Схема не найдена');

  const categories  = _allRows(SHEETS.CATEGORIES);
  const assignments = _allRows(SHEETS.ASSIGNMENTS);
  const colTypes    = _allRows(SHEETS.COL_TYPES);
  const tables      = _allRows(SHEETS.TABLES).filter(t => String(t.schema_id) === String(p.schema_id));
  const allColumns  = _allRows(SHEETS.COLUMNS);

  const relations = [];

  const tablesJson = tables.map(t => {
    const cat = categories.find(c => String(c.id) === String(t.category_id));
    const asg = assignments.find(a => String(a.id) === String(t.assignment_id));
    const cols = allColumns
      .filter(c => String(c.table_id) === String(t.id))
      .sort((a,b) => Number(a.position) - Number(b.position));

    const columnsJson = cols.map(c => {
      const ct = colTypes.find(tp => String(tp.id) === String(c.type_id));
      const colObj = {
        id:          c.id,
        name:        c.name,
        description: c.description,
        type:        ct ? ct.designation : '',
        type_name:   ct ? ct.name : '',
        is_pk:       isTrue(c.is_pk),
        is_fk:       isTrue(c.is_fk),
        position:    Number(c.position),
      };
      if (colObj.is_fk && c.fk_table_id) {
        const fkTable = tables.find(ft => String(ft.id) === String(c.fk_table_id));
        const fkCol   = allColumns.find(fc => String(fc.id) === String(c.fk_column_id));
        colObj.fk_table  = fkTable ? fkTable.name : c.fk_table_id;
        colObj.fk_column = fkCol   ? fkCol.name   : c.fk_column_id;
        // Collect relation
        relations.push({
          from_table:  t.name,
          from_column: c.name,
          to_table:    colObj.fk_table,
          to_column:   colObj.fk_column,
          type:        'many_to_one',
        });
      }
      return colObj;
    });

    return {
      id:          t.id,
      name:        t.name,
      description: t.description,
      category:    cat ? cat.name : '',
      assignment:  asg ? asg.name : '',
      position:    { x: Number(t.pos_x)||0, y: Number(t.pos_y)||0 },
      columns:     columnsJson,
    };
  });

  return {
    schema: {
      id:          schema.id,
      name:        schema.name,
      description: schema.description,
      copied_from: schema.copied_from || null,
      exported_at: new Date().toISOString(),
    },
    tables:    tablesJson,
    relations: relations,
    meta: {
      table_count:  tables.length,
      column_count: allColumns.filter(c => tables.some(t => String(t.id) === String(c.table_id))).length,
      relation_count: relations.length,
    },
  };
}

// ═══════════════════════════════════════════════════════════
// JSON IMPORT — BATCH-OPTIMISED (3–5 API calls regardless of size)
// ─────────────────────────────────────────────────────────────
// Old approach: appendRow() per row → O(N+M) API calls (slow)
// New approach: setValues() per sheet → O(1) API calls  (fast)
//
// Strategy:
//  1. Read all lookup data ONCE (5 reads total)
//  2. Compute all IDs in memory using a simple counter
//  3. Resolve FK references in memory BEFORE writing
//  4. Write tables  → 1 setValues() call
//  5. Write columns → 1 setValues() call
//  6. FK columns updated inline (no third pass needed)
// ═══════════════════════════════════════════════════════════
function importSchemaJson(p) {
  Logger.log('importSchemaJson: overwrite=' + !!p.overwrite);
  const json = typeof p.json === 'string' ? JSON.parse(p.json) : p.json;
  if (!json || !json.schema || !Array.isArray(json.tables)) {
    throw new Error('Неверный формат JSON: ожидается {schema:{name,...}, tables:[...]}');
  }

  const ss  = SpreadsheetApp.getActiveSpreadsheet();
  const now = new Date().toISOString();
  const overwrite = !!p.overwrite;

  // ── Helper: get max numeric id from an array of objects ──
  function maxId(arr) {
    return arr.reduce((m, r) => Math.max(m, Number(r.id) || 0), 0);
  }

  // ── Helper: batch-write rows to a sheet (single API call) ──
  function batchAppend(sheetName, rows) {
    if (!rows.length) return;
    const sh = ss.getSheetByName(sheetName);
    const startRow = sh.getLastRow() + 1;
    sh.getRange(startRow, 1, rows.length, rows[0].length).setValues(rows);
  }

  // ── Helper: overwrite schema rows — keeps header, rewrites data
  //    Used for overwrite mode: read all → filter → write back (2 calls vs N deletes)
  function batchDeleteByIds(sheetName, idsToRemove) {
    if (!idsToRemove.size) return;
    const sh = ss.getSheetByName(sheetName);
    if (sh.getLastRow() <= 1) return;
    const numCols = sh.getLastColumn();
    const data    = sh.getRange(2, 1, sh.getLastRow() - 1, numCols).getValues();
    const kept    = data.filter(row => !idsToRemove.has(String(row[0])));
    // Clear existing data rows, then rewrite kept rows — 2 API calls total
    sh.getRange(2, 1, sh.getLastRow() - 1, numCols).clearContent();
    if (kept.length) {
      sh.getRange(2, 1, kept.length, numCols).setValues(kept);
    }
  }

  // ══════════════════════════════════════════════════════════
  // STEP 1 — Read all reference data (5 sheet reads)
  // ══════════════════════════════════════════════════════════
  const colTypes    = _allRows(SHEETS.COL_TYPES);   // read 1
  const categories  = _allRows(SHEETS.CATEGORIES);  // read 2
  const assignments = _allRows(SHEETS.ASSIGNMENTS);  // read 3
  const allSchemas  = _allRows(SHEETS.SCHEMAS);      // read 4
  const allTables   = _allRows(SHEETS.TABLES);       // read 5
  const allColumns  = _allRows(SHEETS.COLUMNS);      // read 6

  // ══════════════════════════════════════════════════════════
  // STEP 2 — Resolve / batch-create lookup values in memory
  // ══════════════════════════════════════════════════════════

  // Column types — resolve by designation, collect missing ones
  let typeCounter = maxId(colTypes);
  const newTypeRows = [];
  function resolveType(des) {
    if (!des) return '';
    const lc = des.toLowerCase();
    let found = colTypes.find(t => t.designation && t.designation.toLowerCase() === lc);
    if (!found) {
      typeCounter++;
      found = { id: typeCounter, name: des.toUpperCase(), designation: lc, description: '' };
      colTypes.push(found);
      newTypeRows.push([typeCounter, des.toUpperCase(), lc, '', now, now]);
    }
    return found.id;
  }

  // Categories — collect all unique names needed, batch-create missing
  let catCounter  = maxId(categories);
  let asgCounter  = maxId(assignments);
  const catMap    = Object.fromEntries(categories.map(c => [c.name.toLowerCase(), c.id]));
  const asgMap    = Object.fromEntries(assignments.map(a => [a.name.toLowerCase(), a.id]));
  const newCatRows = [], newAsgRows = [];

  function resolveCategory(name) {
    if (!name) return '';
    const lc = name.toLowerCase();
    if (catMap[lc]) return catMap[lc];
    catCounter++;
    catMap[lc] = catCounter;
    categories.push({ id: catCounter, name });
    newCatRows.push([catCounter, name, '', now, now]);
    return catCounter;
  }
  function resolveAssignment(name) {
    if (!name) return '';
    const lc = name.toLowerCase();
    if (asgMap[lc]) return asgMap[lc];
    asgCounter++;
    asgMap[lc] = asgCounter;
    assignments.push({ id: asgCounter, name });
    newAsgRows.push([asgCounter, name, '', now, now]);
    return asgCounter;
  }

  // Pre-resolve all categories/assignments from JSON tables
  json.tables.forEach(t => {
    resolveCategory(t.category || '');
    resolveAssignment(t.assignment || '');
  });

  // ══════════════════════════════════════════════════════════
  // STEP 3 — Handle schema (overwrite or create)
  // ══════════════════════════════════════════════════════════
  const existingSchema = allSchemas.find(s => s.name === json.schema.name);
  if (existingSchema && !overwrite) {
    throw new Error(`Схема "${json.schema.name}" уже существует. Передайте overwrite:true.`);
  }

  let schemaId;
  if (existingSchema && overwrite) {
    // Batch-delete old tables and columns for this schema
    const oldTableIds = new Set(
      allTables.filter(t => String(t.schema_id) === String(existingSchema.id)).map(t => String(t.id))
    );
    const oldColIds = new Set(
      allColumns.filter(c => oldTableIds.has(String(c.table_id))).map(c => String(c.id))
    );
    // 2 API calls instead of N+M individual deletes:
    batchDeleteByIds(SHEETS.COLUMNS, oldColIds);
    batchDeleteByIds(SHEETS.TABLES,  oldTableIds);
    schemaId = existingSchema.id;
    // Update schema name/desc
    _updateRow(SHEETS.SCHEMAS, schemaId,
      { name: json.schema.name, description: json.schema.description || '' },
      ['id','name','description','copied_from','pos_x','pos_y','create_date_time','update_date_time']);
  } else {
    // New schema: compute max ID from in-memory data
    schemaId = maxId(allSchemas) + 1;
    batchAppend(SHEETS.SCHEMAS, [
      [schemaId, json.schema.name, json.schema.description || '', '', 0, 0, now, now]
    ]);
  }

  // ══════════════════════════════════════════════════════════
  // STEP 4 — Build ALL table & column rows in memory
  //          FK references resolved in memory → no 3rd pass
  // ══════════════════════════════════════════════════════════
  const TBL_COLS = 10; // id,schema_id,name,description,category_id,assignment_id,pos_x,pos_y,cdt,udt
  const COL_COLS = 12; // id,table_id,name,description,type_id,is_pk,is_fk,fk_table_id,fk_column_id,position,cdt,udt

  // Re-read max IDs after potential batch-delete
  // (We deleted rows above; allTables/allColumns still hold old data, so re-compute from sheets)
  // Use fast single-column reads for max IDs:
  const tblSh = ss.getSheetByName(SHEETS.TABLES);
  const colSh = ss.getSheetByName(SHEETS.COLUMNS);
  let tableCounter = tblSh.getLastRow() <= 1 ? 0
    : Math.max(...tblSh.getRange(2, 1, tblSh.getLastRow()-1, 1).getValues().flat().map(Number).filter(n=>!isNaN(n)), 0);
  let colCounter = colSh.getLastRow() <= 1 ? 0
    : Math.max(...colSh.getRange(2, 1, colSh.getLastRow()-1, 1).getValues().flat().map(Number).filter(n=>!isNaN(n)), 0);

  const tableMap = {};          // json table name → assigned id
  const colIdByKey = {};        // "table.col" → assigned column id
  const colFkNeeds = [];        // [{rowIndex, fkTable, fkColumn}] — FK to resolve
  const gridCols = Math.ceil(Math.sqrt(json.tables.length)) || 1;

  const tableRows = [];         // 2D array ready for setValues
  const colRows   = [];         // 2D array ready for setValues

  // ── Pass A: assign table IDs & build table rows ──
  json.tables.forEach((t, tIdx) => {
    tableCounter++;
    tableMap[t.name] = tableCounter;
    const catId = resolveCategory(t.category || '');
    const asgId = resolveAssignment(t.assignment || '');
    const px = (t.position && t.position.x != null) ? Number(t.position.x) : (tIdx % gridCols) * 280 + 60;
    const py = (t.position && t.position.y != null) ? Number(t.position.y) : Math.floor(tIdx / gridCols) * 220 + 60;
    tableRows.push([tableCounter, schemaId, t.name, t.description || '', catId, asgId, px, py, now, now]);
  });

  // ── Pass B: assign column IDs, resolve FKs in memory ──
  json.tables.forEach(t => {
    const tableId = tableMap[t.name];
    (t.columns || []).forEach((col, pos) => {
      colCounter++;
      const typeId = resolveType(col.type || col.type_designation || '');
      const isPk   = isTrue(col.is_pk);
      const isFk   = isTrue(col.is_fk) || col.type === 'fk';
      colIdByKey[t.name + '\x00' + col.name] = colCounter;
      const rowIdx = colRows.length;
      colRows.push([colCounter, tableId, col.name, col.description || '',
                    typeId, isPk, isFk,
                    '', '',  // fk_table_id, fk_column_id — patched below
                    pos + 1, now, now]);
      if (isFk && (col.fk_table || col.fk_column)) {
        colFkNeeds.push({ rowIdx, fkTable: col.fk_table || '', fkCol: col.fk_column || '' });
      }
    });
  });

  // ── Pass C: patch FK fields in-memory (zero extra API calls) ──
  colFkNeeds.forEach(({ rowIdx, fkTable, fkCol }) => {
    const fkTableId = tableMap[fkTable];
    if (!fkTableId) return;
    const fkColId   = colIdByKey[fkTable + '\x00' + fkCol] || '';
    colRows[rowIdx][7] = fkTableId;  // fk_table_id  (column index 7)
    colRows[rowIdx][8] = fkColId;    // fk_column_id (column index 8)
  });

  // ══════════════════════════════════════════════════════════
  // STEP 5 — Flush everything to sheets (4 setValues calls)
  // ══════════════════════════════════════════════════════════
  batchAppend(SHEETS.COL_TYPES,   newTypeRows);  // call 1 (0 if no new types)
  batchAppend(SHEETS.CATEGORIES,  newCatRows);   // call 2 (0 if no new cats)
  batchAppend(SHEETS.ASSIGNMENTS, newAsgRows);   // call 3 (0 if no new asgs)
  batchAppend(SHEETS.TABLES,      tableRows);    // call 4 — ALL tables at once
  batchAppend(SHEETS.COLUMNS,     colRows);      // call 5 — ALL columns at once

  return {
    schema_id:    schemaId,
    schema_name:  json.schema.name,
    tables_count: json.tables.length,
    columns_count: colRows.length,
    fk_count:     colFkNeeds.length,
    overwritten:  !!(existingSchema && overwrite),
    api_calls:    'batch (5 writes total)',
  };
}
