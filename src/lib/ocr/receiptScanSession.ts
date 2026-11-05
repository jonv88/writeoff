/** Only the current photo may update the form, even after close/reopen or retries. */
export class ReceiptScanSession {
  private generation = 0;

  begin(): number {
    return ++this.generation;
  }

  invalidate(): void {
    ++this.generation;
  }

  isCurrent(id: number): boolean {
    return id === this.generation;
  }
}
