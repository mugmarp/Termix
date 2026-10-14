import { useEffect, useState, type RefObject } from "react";
import type { TerminalRefHandle } from "@/types/index";

export type ConnectionStatus = "connected" | "disconnected" | "unknown";

/**
 * Polls a terminal tab's isConnected() method on an interval.
 *
 * The TerminalHandle exposes isConnected() as a snapshot — it does not
 * subscribe to changes. To render a live connection indicator in the tab
 * bar, we poll at a low frequency (2s) and return the current status.
 *
 * Returns "unknown" when the tab has no terminal ref yet (tab still
 * mounting, or a non-terminal tab type).
 */
export function useTerminalConnectionStatus(
  terminalRef: RefObject<TerminalRefHandle | null> | undefined,
  pollIntervalMs = 2000,
): ConnectionStatus {
  const [status, setStatus] = useState<ConnectionStatus>("unknown");

  useEffect(() => {
    if (!terminalRef) {
      setStatus("unknown");
      return;
    }

    const check = () => {
      try {
        const connected = terminalRef.current?.isConnected?.();
        if (typeof connected !== "boolean") {
          setStatus("unknown");
        } else {
          setStatus(connected ? "connected" : "disconnected");
        }
      } catch {
        setStatus("unknown");
      }
    };

    check();
    const interval = setInterval(check, pollIntervalMs);
    return () => clearInterval(interval);
  }, [terminalRef, pollIntervalMs]);

  return status;
}
