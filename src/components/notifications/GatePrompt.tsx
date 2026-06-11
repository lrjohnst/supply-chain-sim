import { useGameStore } from "../../store/gameStore";

/**
 * Modal that appears when the player clicks End Turn and there are
 * pending gate actions. Blocks turn advancement until resolved.
 * Shown by BottomBar when the gate queue is non-empty after an End Turn attempt.
 */
export default function GatePrompt() {
  const gateQueue = useGameStore((s) => s.gateQueue);
  const action = gateQueue[0];
  if (!action) return null;

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 200,
      background: "rgba(0,0,0,0.65)",
      display: "flex", alignItems: "center", justifyContent: "center",
    }}>
      <div style={{
        background: "var(--bg-panel)",
        border: "1px solid var(--border)",
        borderRadius: 10,
        padding: "32px 36px",
        width: 400,
        textAlign: "center",
        boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
      }}>
        <div style={{
          color: "var(--text-head)",
          fontSize: 14,
          fontWeight: 600,
          lineHeight: 1.5,
          marginBottom: 24,
        }}>
          {action.message}
        </div>
        <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
          {action.options.map((opt) => (
            <button
              key={opt.label}
              className={opt.style === "primary" ? "primary" : opt.style === "danger" ? "danger" : ""}
              style={{ padding: "9px 24px", fontSize: 13, minWidth: 120 }}
              onClick={opt.handler}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
