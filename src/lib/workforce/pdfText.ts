import { groupItemsIntoLines, type PdfTextItem } from './biometricParser';

/**
 * Extracts text lines per page from a PDF in the browser.
 * pdf.js is loaded on demand so it never weighs down the rest of the app.
 */
export async function extractPdfLines(data: ArrayBuffer): Promise<string[][]> {
  const [pdfjs, worker] = await Promise.all([
    import('pdfjs-dist'),
    import('pdfjs-dist/build/pdf.worker.min.mjs?url'),
  ]);
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;

  // pdf.js takes ownership of the buffer, so pass a copy.
  const document = await pdfjs.getDocument({ data: new Uint8Array(data.slice(0)) }).promise;
  try {
    const pages: string[][] = [];
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber++) {
      const page = await document.getPage(pageNumber);
      const content = await page.getTextContent();
      const items: PdfTextItem[] = [];
      for (const item of content.items) {
        if ('str' in item) items.push({ str: item.str, x: item.transform[4], y: item.transform[5] });
      }
      pages.push(groupItemsIntoLines(items));
      page.cleanup();
    }
    return pages;
  } finally {
    await document.destroy();
  }
}

/** Hex SHA-256 of the file, used to reject importing the same PDF twice. */
export async function sha256Hex(data: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}
