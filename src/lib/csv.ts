// CSV export. Every value carries its exact integer plus its status, never a
// unit-scaled or rounded number.

export type CsvCell = string | number | null;

export function toCsv(headers: string[], rows: CsvCell[][]): string {
  const escape = (cell: CsvCell): string => {
    if (cell === null || cell === undefined) return '';
    const s = String(cell);
    if (/[",\n]/.test(s)) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  };
  const lines = [headers.map(escape).join(',')];
  for (const row of rows) {
    lines.push(row.map(escape).join(','));
  }
  return lines.join('\r\n') + '\r\n';
}

export function downloadCsv(filename: string, csv: string): void {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
