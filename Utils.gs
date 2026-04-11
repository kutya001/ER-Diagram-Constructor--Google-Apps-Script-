// ============================================================
// Utils.gs — Общие утилиты для работы с листами
// ============================================================
// Зависит: SHEETS (из Backend.gs)
// ============================================================

/** Универсальная проверка на truthy-значение для boolean из Google Sheets.
 *  Google Sheets может возвращать boolean как true/false, 'true'/'false', 'TRUE'/'FALSE'.
 */
function isTrue(v) {
  return v === true || v === 'true' || v === 'TRUE';
}

function _sheet(name) {
  return SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name);
}

function _allRows(sheetName) {
  const sh = _sheet(sheetName);
  if (sh.getLastRow() <= 1) return [];
  const [headers, ...rows] = sh.getDataRange().getValues();
  return rows.map(r => Object.fromEntries(headers.map((h, i) => [h, r[i]])));
}

function _nextId(sheetName) {
  const sh = _sheet(sheetName);
  if (sh.getLastRow() <= 1) return 1;
  const ids = sh.getRange(2, 1, sh.getLastRow() - 1, 1).getValues().flat();
  return ids.length ? Math.max(...ids.map(Number).filter(n => !isNaN(n))) + 1 : 1;
}

function _appendRow(sheetName, obj, headers) {
  const sh = _sheet(sheetName);
  sh.appendRow(headers.map(h => obj[h] !== undefined ? obj[h] : ''));
  return obj;
}

function _updateRow(sheetName, id, updates, headers) {
  const sh = _sheet(sheetName);
  if (sh.getLastRow() <= 1) return null;
  // Проверка совпадения заголовков — предупреждение в лог
  if (sh.getLastColumn() !== headers.length) {
    Logger.log('Warning: headers mismatch for ' + sheetName +
      ' (expected ' + headers.length + ', got ' + sh.getLastColumn() + ')');
  }
  const ids = sh.getRange(2, 1, sh.getLastRow() - 1, 1).getValues().flat();
  const rowIdx = ids.findIndex(r => String(r) === String(id));
  if (rowIdx === -1) return null;
  const realRow = rowIdx + 2;
  const existing = Object.fromEntries(headers.map((h, i) => [h, sh.getRange(realRow, i+1).getValue()]));
  const merged = { ...existing, ...updates, update_date_time: new Date().toISOString() };
  sh.getRange(realRow, 1, 1, headers.length).setValues([headers.map(h => merged[h] !== undefined ? merged[h] : '')]);
  return merged;
}

function _deleteRow(sheetName, id) {
  const sh = _sheet(sheetName);
  if (sh.getLastRow() <= 1) return false;
  const ids = sh.getRange(2, 1, sh.getLastRow() - 1, 1).getValues().flat();
  const rowIdx = ids.findIndex(r => String(r) === String(id));
  if (rowIdx === -1) return false;
  sh.deleteRow(rowIdx + 2);
  return true;
}

// Batch delete rows matching predicate — reads once, rewrites kept rows (2 API calls)
function _batchDeleteWhere(sheetName, predicate) {
  const sh = _sheet(sheetName);
  if (sh.getLastRow() <= 1) return 0;
  const numCols = sh.getLastColumn();
  const [headers, ...data] = sh.getDataRange().getValues();
  const kept = data.filter(row => {
    const obj = Object.fromEntries(headers.map((h,i)=>[h,row[i]]));
    return !predicate(obj);
  });
  const deleted = data.length - kept.length;
  if (!deleted) return 0;
  sh.getRange(2, 1, data.length, numCols).clearContent();
  if (kept.length) sh.getRange(2, 1, kept.length, numCols).setValues(kept);
  return deleted;
}

/** Проверяет, что целевая таблица и колонка для FK существуют. */
function validateFkTarget(fkTableId, fkColumnId) {
  if (!fkTableId && !fkColumnId) return; // не FK — пропускаем
  const table = _allRows(SHEETS.TABLES).find(t => String(t.id) === String(fkTableId));
  if (!table) throw new Error('Целевая таблица FK не найдена: ' + fkTableId);
  if (fkColumnId) {
    const col = _allRows(SHEETS.COLUMNS).find(c => String(c.id) === String(fkColumnId));
    if (!col) throw new Error('Целевая колонка FK не найдена: ' + fkColumnId);
  }
}
