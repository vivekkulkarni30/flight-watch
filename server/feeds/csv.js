// A small CSV reader and writer, enough for the data files we use.
// Handles quoted fields with commas, doubled quotes ("") and line breaks inside them.

// Turn CSV text into an array of rows, each an array of strings.
export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += ch;
    }
  }
  // Last line, if the file doesn't end with a newline.
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

// Turn one row of values into a CSV line, quoting a field only when it has a comma, quote or line break.
export function toCsvLine(values) {
  return values
    .map((value) => {
      const s = String(value);
      return /[",\r\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
    })
    .join(',');
}
