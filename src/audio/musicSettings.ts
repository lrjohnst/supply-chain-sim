import type { MusicParams } from "./musicEngine";
import { GameConfig } from "../config/gameConfig";

const STORAGE_KEY = "scs_music_settings";

export function loadMusicSettings(): MusicParams {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<MusicParams>;
      return { ...GameConfig.music, ...parsed };
    }
  } catch {
    // ignore
  }
  return { ...GameConfig.music };
}

export function saveMusicSettings(p: MusicParams): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(p));
  } catch {
    // ignore
  }
}
