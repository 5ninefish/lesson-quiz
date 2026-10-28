import fs from "node:fs";
import vm from "node:vm";
import path from "node:path";
import { applyBatch, type MockBook } from "./mock-workbook";

export type CodeRuntime = {
  json: (value: { getContent?: () => string; text?: string }) => Record<string, unknown>;
  batchCalls: number;
  book: MockBook;
};

export function loadCode(book: MockBook, options: { failBatch?: boolean } = {}): CodeRuntime & Record<string, unknown> {
  const source = [fs.readFileSync(path.resolve("Code.gs"), "utf8"), fs.readFileSync(path.resolve("LessonBridge.gs"), "utf8")].join("\n");
  const batchCalls = { n: 0 };
  const context: Record<string, unknown> = {
    console,
    book,
    SpreadsheetApp: {
      getActiveSpreadsheet: () => book,
      flush: () => undefined,
      getUi: () => ({
        createMenu: () => {
          const menu = {
            addItem: () => menu,
            addSeparator: () => menu,
            addToUi: () => undefined,
          };
          return menu;
        },
        alert: () => undefined,
      }),
    },
    LockService: {
      getScriptLock: () => ({
        waitLock: () => undefined,
        releaseLock: () => undefined,
      }),
    },
    Utilities: {
      getUuid: () => `sub-${batchCalls.n + 1}-${Math.random().toString(16).slice(2)}`,
      formatDate: (date: Date) => date.toISOString(),
      computeDigest: () => [],
      DigestAlgorithm: { SHA_256: "SHA_256" },
    },
    Session: { getEffectiveUser: () => ({ getEmail: () => "owner@example.edu" }) },
    ScriptApp: { getOAuthToken: () => "script-token" },
    PropertiesService: { getScriptProperties: () => ({ getProperty: () => "" }) },
    ContentService: {
      MimeType: { JSON: "application/json" },
      createTextOutput: (text: string) => ({
        setMimeType: () => ({ getContent: () => text, text }),
      }),
    },
    UrlFetchApp: {
      fetch: (url: string, opts: { payload?: string; headers?: Record<string, string> } = {}) => {
        const token = String((opts.headers && opts.headers.Authorization) || "").replace("Bearer ", "");
        if (url.indexOf("userinfo") >= 0) {
          if (token === "expired-token") return { getResponseCode: () => 401, getContentText: () => "" };
          if (token === "editor-token" || token === "editor-failbatch" || token === "editor-noscope") {
            return { getResponseCode: () => 200, getContentText: () => JSON.stringify({ email: "editor@example.edu" }) };
          }
          if (token === "viewer-token") {
            return { getResponseCode: () => 200, getContentText: () => JSON.stringify({ email: "viewer@example.edu" }) };
          }
          return { getResponseCode: () => 401, getContentText: () => "" };
        }
        if (url.indexOf("drive/v3/files") >= 0) {
          const canEdit = token === "editor-token" || token === "editor-failbatch" || token === "editor-noscope";
          if (token === "expired-token") return { getResponseCode: () => 401, getContentText: () => "" };
          return {
            getResponseCode: () => 200,
            getContentText: () => JSON.stringify({ capabilities: { canEdit, canModifyContent: canEdit } }),
          };
        }
        if (url.indexOf(":batchUpdate") >= 0) {
          batchCalls.n += 1;
          if (token === "editor-noscope") return { getResponseCode: () => 403, getContentText: () => "" };
          if (options.failBatch || token === "editor-failbatch") return { getResponseCode: () => 500, getContentText: () => "" };
          applyBatch(book, String(opts.payload || "{\"requests\":[]}"));
          return { getResponseCode: () => 200, getContentText: () => "{}" };
        }
        return { getResponseCode: () => 404, getContentText: () => "" };
      },
    },
  };
  vm.createContext(context);
  vm.runInContext(source, context, { filename: "Code.gs" });
  return Object.assign(context, {
    book,
    batchCalls: batchCalls.n,
    batchCounter: batchCalls,
    json: (value: { getContent?: () => string; text?: string }) =>
      JSON.parse((value && (value.getContent ? value.getContent() : value.text)) || "{}"),
  });
}
