// ─── Instruction storage ──────────────────────────────────────
const INST_SHEET = 'Инструкция';

function getInstruction(p) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(INST_SHEET);
  if (!sh) return { text: '', updated_at: '' };
  const v = sh.getRange('A1').getValue();
  const u = sh.getRange('B1').getValue();
  return { text: String(v || ''), updated_at: u ? new Date(u).toISOString() : '' };
}

function saveInstruction(p) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(INST_SHEET);
  if (!sh) { sh = ss.insertSheet(INST_SHEET); }
  const now = new Date().toISOString();
  sh.getRange('A1').setValue(p.text || '');
  sh.getRange('B1').setValue(now);
  return { saved: true, updated_at: now };
}
