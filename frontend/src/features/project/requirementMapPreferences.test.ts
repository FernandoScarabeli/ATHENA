// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { mapPreferencesKey, readMapPreferences, writeMapPreferences } from './requirementMapPreferences';

beforeEach(() => localStorage.clear());

describe('requirement map preferences', () => {
  it('persists collapse, folder positions, and story order independently by project', () => {
    const projectOne = { collapsedFolderIds: ['f1'], folderPositions: { f1: { x: 120, y: 80 } }, storyOrderByFolder: { f1: ['r2', 'r1'] } };
    const projectTwo = { collapsedFolderIds: [], folderPositions: { f2: { x: 40, y: 10 } }, storyOrderByFolder: {} };

    writeMapPreferences('p1', projectOne, true);
    writeMapPreferences('p2', projectTwo, true);

    expect(readMapPreferences('p1')).toEqual(projectOne);
    expect(readMapPreferences('p2')).toEqual(projectTwo);
    expect(mapPreferencesKey('p1')).not.toBe(mapPreferencesKey('p2'));
  });

  it('reads saved layouts from before story ordering was added', () => {
    localStorage.setItem(mapPreferencesKey('p1'), JSON.stringify({ collapsedFolderIds: ['f1'], folderPositions: { f1: { x: 1, y: 2 } } }));

    expect(readMapPreferences('p1')).toEqual({ collapsedFolderIds: ['f1'], folderPositions: { f1: { x: 1, y: 2 } }, storyOrderByFolder: {} });
  });

  it('drops invalid values and clears the project key when layout returns to default', () => {
    localStorage.setItem(mapPreferencesKey('p1'), JSON.stringify({ collapsedFolderIds: [2], folderPositions: { f1: { x: 'bad', y: 1 }, f2: { x: 3, y: 4 } }, storyOrderByFolder: { f1: ['r1', null] } }));
    expect(readMapPreferences('p1')).toEqual({ collapsedFolderIds: [], folderPositions: { f2: { x: 3, y: 4 } }, storyOrderByFolder: {} });

    writeMapPreferences('p1', { collapsedFolderIds: [], folderPositions: {}, storyOrderByFolder: {} }, false);
    expect(localStorage.getItem(mapPreferencesKey('p1'))).toBeNull();
  });
});
