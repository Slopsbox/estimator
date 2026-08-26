export const PROTOTYPE_CSV_FILENAME = 'squad-health-demo-resultat.csv';
export const PROTOTYPE_CSV_MEDIA_TYPE = 'text/csv;charset=utf-8';

export interface PrototypeDownloadAnchor {
  href: string;
  download: string;
  rel: string;
  hidden: boolean;
  click(): void;
  remove(): void;
}

export interface PrototypeCsvDownloadDependencies {
  readonly createBlob: (text: string, mediaType: string) => Blob;
  readonly createObjectURL: (blob: Blob) => string;
  readonly revokeObjectURL: (url: string) => void;
  readonly createAnchor: () => PrototypeDownloadAnchor;
  readonly appendAnchor: (anchor: PrototypeDownloadAnchor) => void;
  readonly scheduleCleanup: (cleanup: () => void) => void;
}

export function downloadPrototypeCsv(
  csv: string,
  dependencies: PrototypeCsvDownloadDependencies,
): boolean {
  let objectUrl: string | undefined;
  let anchor: PrototypeDownloadAnchor | undefined;

  try {
    const blob = dependencies.createBlob(csv, PROTOTYPE_CSV_MEDIA_TYPE);
    objectUrl = dependencies.createObjectURL(blob);
    anchor = dependencies.createAnchor();
    anchor.href = objectUrl;
    anchor.download = PROTOTYPE_CSV_FILENAME;
    anchor.rel = 'noopener';
    anchor.hidden = true;
    dependencies.appendAnchor(anchor);
    anchor.click();
  } catch {
    removeAnchor(anchor);
    revokeObjectUrl(dependencies, objectUrl);
    return false;
  }

  removeAnchor(anchor);
  try {
    dependencies.scheduleCleanup(() => revokeObjectUrl(dependencies, objectUrl));
  } catch {
    revokeObjectUrl(dependencies, objectUrl);
  }
  return true;
}

function removeAnchor(anchor: PrototypeDownloadAnchor | undefined) {
  try {
    anchor?.remove();
  } catch {
    // The browser may already have detached the temporary anchor.
  }
}

function revokeObjectUrl(
  dependencies: PrototypeCsvDownloadDependencies,
  objectUrl: string | undefined,
) {
  if (objectUrl === undefined) return;
  try {
    dependencies.revokeObjectURL(objectUrl);
  } catch {
    // Revocation is best-effort after the browser has started the download.
  }
}
