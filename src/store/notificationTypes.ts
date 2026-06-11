// ============================================================
// Notification and End Turn Gate types
// These live in the Zustand store, not in GameState.
// Handlers are closures — not serializable, no save/load support in MVP.
// ============================================================

export interface NotificationAction {
  label: string;
  handler: () => void;
  style?: "primary" | "danger" | "default";
}

export interface AppNotification {
  id: string;
  turn: number;
  message: string;
  actions?: NotificationAction[];
  dismissed: boolean;
  /** Persistent notifications cannot be dismissed by the player.
   *  They remain in the list until resolved via an action button. */
  persistent: boolean;
}

export interface GateAction {
  id: string;
  message: string;
  options: NotificationAction[];
}
