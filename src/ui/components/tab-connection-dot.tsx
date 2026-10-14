import {
  getStatusClasses,
  useStatusColorScheme,
} from "@/hooks/use-status-color-scheme";
import { useTerminalConnectionStatus } from "@/hooks/use-terminal-connection-status";
import type { RefObject } from "react";
import type { TerminalRefHandle } from "@/types/index";

interface TabConnectionDotProps {
  terminalRef: RefObject<TerminalRefHandle | null> | undefined;
}

/**
 * Renders a small connection status dot for a terminal tab.
 * Polls the terminal's isConnected() method and displays:
 * - green dot when connected
 * - red dot when disconnected
 * - pulsing gray dot when unknown (still mounting)
 */
export function TabConnectionDot({ terminalRef }: TabConnectionDotProps) {
  const statusScheme = useStatusColorScheme();
  const connectionStatus = useTerminalConnectionStatus(terminalRef);

  if (!terminalRef) return null;

  return (
    <span
      className={`size-1.5 rounded-full shrink-0 ${getStatusClasses(
        connectionStatus === "unknown"
          ? "unknown"
          : connectionStatus === "connected",
        statusScheme,
        "dot",
      )}`}
      title={
        connectionStatus === "connected"
          ? "Connected"
          : connectionStatus === "disconnected"
            ? "Disconnected"
            : "Connecting..."
      }
    />
  );
}
