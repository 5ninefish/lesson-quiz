export type MockSheet = {
  name: string;
  getSheetId: () => number;
  getLastColumn: () => number;
  getLastRow: () => number;
  getRange: (row: number, col: number, numRows?: number, numCols?: number) => MockRange;
  getDataRange: () => MockRange;
  appendRow: (values: unknown[]) => void;
  setFrozenRows: (n: number) => void;
  grid: string[][];
};

export type MockRange = {
  getValues: () => string[][];
  getValue: () => string;
  setValue: (value: unknown) => void;
  setValues: (values: unknown[][]) => void;
};

export type MockBook = {
  getId: () => string;
  getSheetByName: (name: string) => MockSheet | null;
  insertSheet: (name: string) => MockSheet;
  getOwner: () => { getEmail: () => string };
  getEditors: () => Array<{ getEmail: () => string }>;
  sheets: Map<string, MockSheet>;
};

function text(value: unknown): string {
  if (value == null) return "";
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

export function makeSheet(name: string, id: number, rows: unknown[][]): MockSheet {
  const grid = rows.map((row) => row.map((cell) => text(cell)));
  const sheet: MockSheet = {
    name,
    grid,
    getSheetId: () => id,
    getLastRow: () => grid.length,
    getLastColumn: () => grid.reduce((max, row) => Math.max(max, row.length), 0),
    setFrozenRows: () => undefined,
    appendRow: (values) => {
      grid.push(values.map((cell) => text(cell)));
    },
    getRange: (row, col, numRows = 1, numCols = 1) => ({
      getValue: () => (grid[row - 1] || [])[col - 1] || "",
      getValues: () => {
        const out: string[][] = [];
        for (let r = 0; r < numRows; r++) {
          const line: string[] = [];
          for (let c = 0; c < numCols; c++) line.push((grid[row - 1 + r] || [])[col - 1 + c] || "");
          out.push(line);
        }
        return out;
      },
      setValue: (value) => {
        while (grid.length < row) grid.push([]);
        const line = grid[row - 1];
        while (line.length < col) line.push("");
        line[col - 1] = text(value);
      },
      setValues: (values) => {
        values.forEach((line, r) => {
          line.forEach((value, c) => {
            while (grid.length < row + r) grid.push([]);
            const target = grid[row - 1 + r];
            while (target.length < col + c) target.push("");
            target[col - 1 + c] = text(value);
          });
        });
      },
    }),
    getDataRange: () => sheet.getRange(1, 1, Math.max(1, grid.length), Math.max(1, sheet.getLastColumn())),
  };
  return sheet;
}

export function makeBook(sheets: Array<[string, unknown[][]]>): MockBook {
  const map = new Map<string, MockSheet>();
  sheets.forEach(([name, rows], index) => map.set(name, makeSheet(name, index + 1, rows)));
  return {
    sheets: map,
    getId: () => "book-1",
    getSheetByName: (name) => map.get(name) || null,
    insertSheet: (name) => {
      const sheet = makeSheet(name, map.size + 1, []);
      map.set(name, sheet);
      return sheet;
    },
    getOwner: () => ({ getEmail: () => "owner@example.edu" }),
    getEditors: () => [],
  };
}

export function readCell(cell: { userEnteredValue?: { stringValue?: string; numberValue?: number } } | undefined): string {
  const value = cell && cell.userEnteredValue;
  if (!value) return "";
  if (value.numberValue != null) return String(value.numberValue);
  return value.stringValue == null ? "" : String(value.stringValue);
}

export function applyBatch(book: MockBook, payload: string): void {
  const body = JSON.parse(payload) as {
    requests: Array<{
      addSheet?: { properties: { sheetId: number; title: string } };
      appendCells?: { sheetId: number; rows: Array<{ values: Array<{ userEnteredValue?: { stringValue?: string; numberValue?: number } }> }> };
      updateCells?: {
        start: { sheetId: number; rowIndex: number; columnIndex: number };
        rows: Array<{ values: Array<{ userEnteredValue?: { stringValue?: string; numberValue?: number } }> }>;
      };
    }>;
  };
  for (const request of body.requests) {
    if (request.addSheet) {
      const title = request.addSheet.properties.title;
      const id = request.addSheet.properties.sheetId;
      if (!book.sheets.has(title)) book.sheets.set(title, makeSheet(title, id, []));
    }
    if (request.appendCells) {
      const sheet = [...book.sheets.values()].find((item) => item.getSheetId() === request.appendCells?.sheetId);
      if (!sheet) throw new Error("missing sheet");
      for (const row of request.appendCells.rows) sheet.grid.push(row.values.map((cell) => readCell(cell)));
    }
    if (request.updateCells) {
      const start = request.updateCells.start;
      const sheet = [...book.sheets.values()].find((item) => item.getSheetId() === start.sheetId);
      if (!sheet) throw new Error("missing sheet");
      request.updateCells.rows.forEach((row, r) => {
        row.values.forEach((cell, c) => {
          const rowIndex = start.rowIndex + r;
          const colIndex = start.columnIndex + c;
          while (sheet.grid.length <= rowIndex) sheet.grid.push([]);
          const line = sheet.grid[rowIndex];
          while (line.length <= colIndex) line.push("");
          line[colIndex] = readCell(cell);
        });
      });
    }
  }
}
