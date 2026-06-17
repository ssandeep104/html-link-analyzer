declare module "bplist-parser" {
  export function parseBuffer<T = unknown>(buffer: Buffer | Uint8Array): T[];
  export function parseFile<T = unknown>(
    fileName: string,
    callback: (err: Error | null, result: T[]) => void,
  ): void;
}
