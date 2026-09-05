"use strict";

const { validateLeadStatusUpdate, validateLeadStatusRowNumber } = require("./lead-status");
const { findLeadStatusColumn, findLeadStatusColumnIndex } = require("./sheet-data");

function planLeadStatusUpdate({ project, sheetData, rowNumber, status }) {
  if (!project) return { statusCode: 404, error: "Project not found." };

  const row = validateLeadStatusRowNumber(rowNumber);
  if (row.error) return { statusCode: 400, error: row.error };

  const validated = validateLeadStatusUpdate({ status });
  if (validated.error) return { statusCode: 400, error: validated.error };

  const columns = sheetData?.columns || [];
  const statusColumn = findLeadStatusColumn(columns);
  const columnIndex = findLeadStatusColumnIndex(columns);
  if (!statusColumn || columnIndex === null) {
    return { statusCode: 400, error: "Lead Status column not found." };
  }

  const rowNumbers = sheetData?.rowNumbers || [];
  if (!rowNumbers.includes(row.value)) {
    return { statusCode: 400, error: "Lead row not found." };
  }

  // Spreadsheet/tab always come from the stored project — never from the client body.
  return {
    value: {
      spreadsheetId: project.spreadsheet_id,
      sheetTitle: project.sheet_title,
      columnIndex,
      rowNumber: row.value,
      status: validated.value
    }
  };
}

function planLeadStatusColumnCreate({ project, sheetData }) {
  if (!project) return { statusCode: 404, error: "Project not found." };

  const columns = sheetData?.columns || [];
  if (findLeadStatusColumn(columns)) {
    return { statusCode: 409, error: "Lead Status column already exists." };
  }

  const rowNumbers = sheetData?.rowNumbers || [];
  return {
    value: {
      spreadsheetId: project.spreadsheet_id,
      sheetTitle: project.sheet_title,
      columnIndex: columns.length,
      rowNumbers,
      // New column cells are blank; initialize data rows to the default display status.
      defaultStatus: "New"
    }
  };
}

module.exports = { planLeadStatusUpdate, planLeadStatusColumnCreate };
