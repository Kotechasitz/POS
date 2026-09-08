// When a listener registered with `ipcMain.handle` throws, Electron's
// `ipcRenderer.invoke` rejects with a message wrapped like:
//   Error invoking remote method 'products:create': DuplicateBarcodeError: A product with barcode "999" already exists
// (the invoke-wrapper prefix, followed by `${error.name}: ${error.message}`
// from the thrown Error's own `toString()`). Neither half is something the
// shop owner should ever see — strip both so only the original, human
// -readable message reaches the UI.
export function toUserMessage(err: unknown): string {
  if (!(err instanceof Error)) {
    return String(err)
  }
  return err.message
    .replace(/^Error invoking remote method '[^']*':\s*/, '')
    .replace(/^[A-Za-z][\w]*:\s*/, '')
}
