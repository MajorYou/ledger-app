declare module 'pdfjs-dist' {
  interface TextItem {
    str: string
  }
  interface TextContent {
    items: TextItem[]
  }
  interface Page {
    getTextContent(): Promise<TextContent>
  }
  interface Document {
    numPages: number
    getPage(n: number): Promise<Page>
  }
  const pdfjsLib: {
    GlobalWorkerOptions: { workerSrc: string }
    getDocument(config: { data: Uint8Array }): { promise: Promise<Document> }
  }
  export = pdfjsLib
}
