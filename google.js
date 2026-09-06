const { google } = require("googleapis");
const { sheetDataFromValues } = require("./sheet-data");

const SCOPES = [
  "openid",
  "email",
  "profile",
  // Sheets' least-privilege scope that permits values.update for Lead Status.
  "https://www.googleapis.com/auth/spreadsheets",
  "https://www.googleapis.com/auth/drive.readonly"
];

function oauth2Client() {
  const client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );
  return client;
}

function getAuthUrl(state) {
  const client = oauth2Client();
  return client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: SCOPES,
    state
  });
}

async function exchangeCode(code) {
  const client = oauth2Client();
  const { tokens } = await client.getToken(code);
  client.setCredentials(tokens);
  return { client, tokens };
}

function clientFromRefreshToken(refreshToken) {
  const client = oauth2Client();
  client.setCredentials({ refresh_token: refreshToken });
  return client;
}

async function getGoogleProfile(client) {
  const oauth2 = google.oauth2({ version: "v2", auth: client });
  const { data } = await oauth2.userinfo.get();
  return data;
}

async function listSpreadsheets(client) {
  const drive = google.drive({ version: "v3", auth: client });
  const q = [
    "trashed = false",
    "mimeType = 'application/vnd.google-apps.spreadsheet'"
  ].join(" and ");

  const out = [];
  let pageToken;

  do {
    const { data } = await drive.files.list({
      q,
      pageSize: 100,
      pageToken,
      fields: "nextPageToken,files(id,name,modifiedTime)"
    });

    for (const f of data.files || []) {
      out.push({
        id: f.id,
        name: f.name,
        modifiedTime: f.modifiedTime
      });
    }

    pageToken = data.nextPageToken;
  } while (pageToken);

  return out;
}

async function getTabs(client, spreadsheetId) {
  const sheets = google.sheets({ version: "v4", auth: client });
  const { data } = await sheets.spreadsheets.get({
    spreadsheetId,
    fields: "sheets(properties(sheetId,title,index,gridProperties(rowCount,columnCount)))"
  });

  return (data.sheets || []).map(s => s.properties);
}

async function readSheet(client, spreadsheetId, sheetTitle) {
  const sheets = google.sheets({ version: "v4", auth: client });

  // A sheet-name-only A1 range reads the used grid without imposing a column limit.
  const range = `'${String(sheetTitle).replace(/'/g, "''")}'`;

  const { data } = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range,
    majorDimension: "ROWS",
    valueRenderOption: "FORMATTED_VALUE"
  });

  return sheetDataFromValues(data.values || []);
}

function quoteSheetTitle(sheetTitle) {
  return `'${String(sheetTitle).replace(/'/g, "''")}'`;
}

function columnLetter(index) {
  let result = "";
  for (let value = index + 1; value > 0; value = Math.floor((value - 1) / 26)) {
    result = String.fromCharCode(65 + ((value - 1) % 26)) + result;
  }
  return result;
}

async function writeLeadStatus(client, spreadsheetId, sheetTitle, columnIndex, rowNumber, status) {
  const sheets = google.sheets({ version: "v4", auth: client });
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${quoteSheetTitle(sheetTitle)}!${columnLetter(columnIndex)}${rowNumber}`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [[status]] }
  });
}

async function addLeadStatusColumn(client, spreadsheetId, sheetTitle, columnIndex) {
  await writeLeadStatus(client, spreadsheetId, sheetTitle, columnIndex, 1, "Lead Status");
}

async function writeLeadStatusCells(client, spreadsheetId, sheetTitle, columnIndex, cells) {
  if (!Array.isArray(cells) || cells.length === 0) return;
  const sheets = google.sheets({ version: "v4", auth: client });
  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId,
    requestBody: {
      valueInputOption: "USER_ENTERED",
      data: cells.map(({ rowNumber, status }) => ({
        range: `${quoteSheetTitle(sheetTitle)}!${columnLetter(columnIndex)}${rowNumber}`,
        values: [[status]]
      }))
    }
  });
}

async function createLeadStatusColumn(client, spreadsheetId, sheetTitle, columnIndex, rowNumbers, defaultStatus = "New") {
  await addLeadStatusColumn(client, spreadsheetId, sheetTitle, columnIndex);
  const cells = (rowNumbers || []).map(rowNumber => ({ rowNumber, status: defaultStatus }));
  await writeLeadStatusCells(client, spreadsheetId, sheetTitle, columnIndex, cells);
}

module.exports = {
  SCOPES,
  oauth2Client,
  getAuthUrl,
  exchangeCode,
  clientFromRefreshToken,
  getGoogleProfile,
  listSpreadsheets,
  getTabs,
  readSheet,
  writeLeadStatus,
  addLeadStatusColumn,
  writeLeadStatusCells,
  createLeadStatusColumn,
  columnLetter,
  quoteSheetTitle
};
