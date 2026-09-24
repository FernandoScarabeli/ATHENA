export interface RequirementMapPreferences {
  collapsedFolderIds: string[];
  folderPositions: Record<string, { x: number; y: number }>;
  storyOrderByFolder: Record<string, string[]>;
}

export interface RequirementMapViewport {
  x: number;
  y: number;
  zoom: number;
}

const emptyPreferences = (): RequirementMapPreferences => ({ collapsedFolderIds: [], folderPositions: {}, storyOrderByFolder: {} });

export function mapPreferencesKey(projectId: string): string {
  return `athena:requirement-map-layout:${projectId}`;
}

function mapViewportKey(projectId: string): string {
  return `athena:requirement-map-viewport:${projectId}`;
}

export function readMapViewport(projectId: string): RequirementMapViewport | null {
  try {
    const value = localStorage.getItem(mapViewportKey(projectId));
    if (!value) return null;
    const viewport = JSON.parse(value) as Partial<RequirementMapViewport>;
    if ([viewport.x, viewport.y, viewport.zoom].some((value) => typeof value !== 'number' || !Number.isFinite(value))) return null;
    if ((viewport.zoom ?? 0) <= 0) return null;
    return { x: viewport.x!, y: viewport.y!, zoom: viewport.zoom! };
  } catch {
    return null;
  }
}

export function writeMapViewport(projectId: string, viewport: RequirementMapViewport): void {
  try {
    localStorage.setItem(mapViewportKey(projectId), JSON.stringify(viewport));
  } catch { /* The map remains usable if browser storage is unavailable. */ }
}

export function readMapPreferences(projectId: string): RequirementMapPreferences {
  try {
    const value = localStorage.getItem(mapPreferencesKey(projectId));
    if (!value) return emptyPreferences();
    const parsed = JSON.parse(value) as Partial<RequirementMapPreferences>;
    const rawPositions = parsed.folderPositions && typeof parsed.folderPositions === 'object' ? parsed.folderPositions : {};
    const folderPositions = Object.fromEntries(Object.entries(rawPositions).filter((entry): entry is [string, { x: number; y: number }] => {
      const position = entry[1];
      return typeof position?.x === 'number' && Number.isFinite(position.x) && typeof position?.y === 'number' && Number.isFinite(position.y);
    }));
    const rawOrder = parsed.storyOrderByFolder && typeof parsed.storyOrderByFolder === 'object' ? parsed.storyOrderByFolder : {};
    return {
      collapsedFolderIds: Array.isArray(parsed.collapsedFolderIds) ? parsed.collapsedFolderIds.filter((id): id is string => typeof id === 'string') : [],
      folderPositions,
      storyOrderByFolder: Object.fromEntries(Object.entries(rawOrder).filter((entry): entry is [string, string[]] => Array.isArray(entry[1]) && entry[1].every((id) => typeof id === 'string'))),
    };
  } catch {
    return emptyPreferences();
  }
}

export function writeMapPreferences(projectId: string, preferences: RequirementMapPreferences, hasCustomLayout: boolean): void {
  try {
    if (!hasCustomLayout) localStorage.removeItem(mapPreferencesKey(projectId));
    else localStorage.setItem(mapPreferencesKey(projectId), JSON.stringify(preferences));
  } catch { /* The map remains usable if browser storage is unavailable. */ }
}
