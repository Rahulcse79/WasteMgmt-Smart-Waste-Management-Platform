"use client";
import { useEffect, useRef, useState } from "react";
import { auth } from "./api";

const WS_URL = process.env.NEXT_PUBLIC_WS_URL ?? "ws://localhost:3023/ws";

export interface WsEvent<T = unknown> {
  topic?: string;
  event: string;
  payload: T;
  ts?: number;
}

interface SocketPoolEntry {
  ws: WebSocket | null;
  listeners: Set<(e: WsEvent) => void>;
  readyListeners: Set<(ready: boolean) => void>;
  alive: boolean;
  attempt: number;
  reconnectTimer: ReturnType<typeof setTimeout> | null;
}

const socketPool = new Map<string, SocketPoolEntry>();

function topicsKey(topics: string[]): string {
  return [...new Set(topics.map((t) => t.trim()).filter(Boolean))].sort().join(",");
}

function ensureEntry(key: string): SocketPoolEntry {
  let entry = socketPool.get(key);
  if (entry) return entry;
  entry = {
    ws: null,
    listeners: new Set(),
    readyListeners: new Set(),
    alive: true,
    attempt: 0,
    reconnectTimer: null,
  };
  socketPool.set(key, entry);
  return entry;
}

function setReady(entry: SocketPoolEntry, ready: boolean): void {
  for (const fn of entry.readyListeners) fn(ready);
}

function connect(key: string, entry: SocketPoolEntry): void {
  // Re-read the token on EVERY (re)connect attempt. The token may have been
  // refreshed by the axios interceptor while the previous socket was dead;
  // capturing it once at first-connect would keep using a stale value forever.
  const token = auth.token();
  if (!token) {
    setReady(entry, false);
    return;
  }
  const url = `${WS_URL}?token=${encodeURIComponent(token)}&topics=${encodeURIComponent(key || "*")}`;
  const ws = new WebSocket(url);
  entry.ws = ws;

  ws.onopen = () => {
    entry.attempt = 0;
    setReady(entry, true);
  };
  ws.onmessage = (m) => {
    try {
      const data = JSON.parse(m.data) as WsEvent;
      for (const fn of entry.listeners) fn(data);
    } catch {
      /* ignore malformed payload */
    }
  };
  ws.onclose = () => {
    setReady(entry, false);
    if (!entry.alive || entry.listeners.size === 0) return;
    // Full-jitter exponential backoff, capped at 30s. Without jitter every
    // tab reconnects in lockstep when the server bounces -> thundering herd.
    const expCap = Math.min(30_000, 1000 * 2 ** entry.attempt++);
    const delay = Math.floor(Math.random() * expCap);
    entry.reconnectTimer = setTimeout(() => connect(key, entry), delay);
  };
  ws.onerror = () => ws.close();
}

function cleanupIfUnused(key: string, entry: SocketPoolEntry): void {
  if (entry.listeners.size > 0 || entry.readyListeners.size > 0) return;
  entry.alive = false;
  if (entry.reconnectTimer) clearTimeout(entry.reconnectTimer);
  entry.ws?.close();
  socketPool.delete(key);
}

/**
 * Subscribe to live server events. Auto-reconnects with exponential back-off.
 */
export function useLiveSocket(topics: string[], onEvent: (e: WsEvent) => void): { ready: boolean } {
  const [ready, setReady] = useState(false);
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;
  const key = topicsKey(topics);

  useEffect(() => {
    const entry = ensureEntry(key);
    entry.alive = true;
    const messageListener = (e: WsEvent) => onEventRef.current(e);
    const readyListener = (state: boolean) => setReady(state);
    entry.listeners.add(messageListener);
    entry.readyListeners.add(readyListener);

    if (!entry.ws || entry.ws.readyState === WebSocket.CLOSED) {
      connect(key, entry);
    } else if (entry.ws.readyState === WebSocket.OPEN) {
      setReady(true);
    }

    return () => {
      entry.listeners.delete(messageListener);
      entry.readyListeners.delete(readyListener);
      cleanupIfUnused(key, entry);
    };
  }, [key]);

  return { ready };
}
