import { useGameStore, selectUndismissedCount } from "../../store/gameStore";

export function NotificationBell() {
  const count = useGameStore(selectUndismissedCount);
  const toggle = useGameStore((s) => s.toggleNotificationPanel);
  const open = useGameStore((s) => s.notificationPanelOpen);

  return (
    <button
      onClick={toggle}
      title="Notifications"
      style={{
        position: "relative",
        background: "transparent",
        border: open ? "1px solid var(--accent)" : "1px solid transparent",
        borderRadius: 4,
        padding: "0 10px",
        height: 30,
        fontSize: 16,
        color: count > 0 ? "var(--warn)" : "var(--text-dim)",
        cursor: "pointer",
      }}
    >
      🔔
      {count > 0 && (
        <span style={{
          position: "absolute",
          top: 2, right: 2,
          background: "var(--danger)",
          color: "#fff",
          borderRadius: "50%",
          fontSize: 9,
          fontWeight: 700,
          width: 14, height: 14,
          display: "flex", alignItems: "center", justifyContent: "center",
          lineHeight: 1,
        }}>
          {count > 9 ? "9+" : count}
        </span>
      )}
    </button>
  );
}

export function NotificationPanel() {
  const open = useGameStore((s) => s.notificationPanelOpen);
  const notifications = useGameStore((s) => s.notifications);
  const dismiss = useGameStore((s) => s.dismissNotification);
  const gameState = useGameStore((s) => s.gameState);

  if (!open) return null;

  const visible = [...notifications].reverse(); // newest first

  const turnLabel = (turn: number) => {
    const year = 1980 + Math.floor(turn / 4);
    const q = (turn % 4) + 1;
    return `${year} Q${q}`;
  };

  return (
    <div style={{
      position: "fixed",
      top: 42,    // below nav bar
      right: 0,
      width: 340,
      maxHeight: "calc(100vh - 94px)", // below nav, above bottom bar
      background: "var(--bg-panel)",
      borderLeft: "1px solid var(--border)",
      borderBottom: "1px solid var(--border)",
      zIndex: 150,
      display: "flex",
      flexDirection: "column",
      overflow: "hidden",
    }}>
      <div style={{
        padding: "12px 16px",
        borderBottom: "1px solid var(--border)",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        flexShrink: 0,
      }}>
        <h2>Notifications</h2>
        <span style={{ color: "var(--text-dim)", fontSize: 11 }}>
          {notifications.filter((n) => !n.dismissed).length} unread
        </span>
      </div>

      <div style={{ overflowY: "auto", flex: 1 }}>
        {visible.length === 0 && (
          <div style={{ padding: 16, color: "var(--text-dim)", fontSize: 12 }}>
            No notifications yet.
          </div>
        )}
        {visible.map((notif) => (
          <div
            key={notif.id}
            style={{
              padding: "10px 16px",
              borderBottom: "1px solid var(--border)",
              opacity: notif.dismissed ? 0.45 : 1,
              background: notif.persistent ? "rgba(212,168,67,0.04)" : "transparent",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
              <span style={{ fontSize: 11, color: "var(--text-dim)" }}>
                {turnLabel(notif.turn)}
              </span>
              {!notif.persistent && !notif.dismissed && (
                <button
                  onClick={() => dismiss(notif.id)}
                  style={{
                    background: "transparent", border: "none",
                    color: "var(--text-dim)", fontSize: 11,
                    padding: "0 4px", cursor: "pointer",
                  }}
                >
                  ✕
                </button>
              )}
              {notif.persistent && (
                <span style={{ fontSize: 10, color: "var(--gold)", fontWeight: 600 }}>
                  PERSISTENT
                </span>
              )}
            </div>
            <div style={{ fontSize: 12, color: "var(--text)", lineHeight: 1.5 }}>
              {notif.message}
            </div>
            {notif.actions && notif.actions.length > 0 && (
              <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                {notif.actions.map((action) => (
                  <button
                    key={action.label}
                    className={action.style === "primary" ? "primary" : action.style === "danger" ? "danger" : ""}
                    style={{ fontSize: 11, padding: "3px 12px" }}
                    onClick={action.handler}
                  >
                    {action.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
