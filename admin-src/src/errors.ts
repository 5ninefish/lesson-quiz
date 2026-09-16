export type ErrorCode =
  | "sign_in"
  | "permission"
  | "quota"
  | "network"
  | "invalid_workbook"
  | "parse"
  | "write_verify";

export function instructorMessage(code: ErrorCode): string {
  switch (code) {
    case "sign_in":
      return "Sign in again with a UH Google account. Your filters are kept.";
    case "permission":
      return "This Google account cannot open the program workbook. Ask to be added as a viewer or editor.";
    case "quota":
      return "Google paused requests. Wait, then refresh manually.";
    case "network":
      return "Network failed. Last good data is still on screen.";
    case "invalid_workbook":
      return "The workbook is missing a required tab. Do not run setup() on the live book.";
    case "parse":
      return "Some rows could not be parsed. Open Data Health for row numbers.";
    case "write_verify":
      return "The write did not match the expected cells. Nothing was retried.";
  }
}
