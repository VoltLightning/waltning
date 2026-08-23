export function previewResetEnabled(dev: boolean, configured: string | undefined): boolean {
  return dev || configured === "true";
}
