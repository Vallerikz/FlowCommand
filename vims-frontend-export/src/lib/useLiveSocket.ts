import { useEffect, useRef, useState } from "react";

import { WS_URL } from "./config";

export type SocketStatus = "connecting" | "open" | "reconnecting";

/**
 * Subscribes to a backend WebSocket feed and reconnects every 3s while down.
 * `data` only ever holds the most recent payload the backend actually sent.
 */
export function useLiveSocket<T>(path: string, enabled = true) {
  const [data, setData] = useState<T | null>(null);
  const [status, setStatus] = useState<SocketStatus>("connecting");
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const socketRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    if (!enabled || typeof window === "undefined") return;

    let disposed = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let hadConnection = false;

    const connect = () => {
      if (disposed) return;
      setStatus(hadConnection ? "reconnecting" : "connecting");

      let socket: WebSocket;
      try {
        socket = new WebSocket(`${WS_URL}${path}`);
      } catch {
        timer = setTimeout(connect, 3000);
        return;
      }
      socketRef.current = socket;

      socket.onopen = () => {
        if (disposed) return;
        hadConnection = true;
        setStatus("open");
      };

      socket.onmessage = (event) => {
        if (disposed) return;
        try {
          setData(JSON.parse(event.data as string) as T);
          setLastUpdate(new Date());
        } catch {
          console.warn(`[VIMS] Unreadable frame on ${path}`);
        }
      };

      socket.onerror = () => {
        socket.close();
      };

      socket.onclose = () => {
        if (disposed) return;
        console.warn(`[VIMS] ${path} disconnected — retrying in 3s`);
        setStatus("reconnecting");
        timer = setTimeout(connect, 3000);
      };
    };

    connect();

    return () => {
      disposed = true;
      if (timer) clearTimeout(timer);
      const socket = socketRef.current;
      socketRef.current = null;
      if (socket) {
        socket.onclose = null;
        socket.onerror = null;
        socket.close();
      }
    };
  }, [path, enabled]);

  return { data, status, lastUpdate, connected: status === "open" };
}
