declare module "pdf-parse" {
  type PDFParseOptions = {
    data: Buffer | Uint8Array;
    password?: string;
    filename?: string;
    verbosity?: number;
  };

  type PDFTextResult = {
    text: string;
    pages: Array<{ text: string; num: number }>;
    total: number;
    getPageText(num: number): string;
  };

  export class PDFParse {
    constructor(options: PDFParseOptions);
    static setWorker(workerSrc?: string): string;
    getText(params?: Record<string, unknown>): Promise<PDFTextResult>;
  }
}
