declare module "node:fs" {
  export function readFileSync(path: string, encoding: "utf8"): string;
}

declare module "node:path" {
  export function resolve(...parts: string[]): string;
}

declare module "node:vm" {
  export function createContext(sandbox: object): object;
  export function runInContext(code: string, contextified: object, options?: { filename?: string }): unknown;
}
