/**
 * Server-Sent Events (SSE) service
 */

import type { EventStreamCallbacks } from '../../types/api.js';

/**
 * Create an EventSource connection to the server
 */
export function createEventStream({
  onRepos,
  onSessions,
  onTasks,
  onConnect,
  onDisconnect,
}: EventStreamCallbacks = {}): () => void {
  if (typeof window === 'undefined' || typeof window.EventSource === 'undefined') {
    if (typeof onDisconnect === 'function') {
      onDisconnect();
    }
    return () => {};
  }

  let closed = false;
  let eventSource: EventSource | null = null;
  let reconnectTimer: number | null = null;
  let reconnectDelay = 2000;

  function clearReconnectTimer() {
    if (reconnectTimer !== null && typeof window !== 'undefined') {
      window.clearTimeout(reconnectTimer);
    }
    reconnectTimer = null;
  }

  function scheduleReconnect() {
    if (closed) {
      return;
    }
    if (reconnectTimer !== null) {
      return;
    }
    const delay = Math.min(reconnectDelay, 30000);
    reconnectTimer = window.setTimeout(() => {
      reconnectTimer = null;
      reconnectDelay = Math.min(delay * 2, 30000);
      connect();
    }, delay);
  }

  function handleReposEvent(event: MessageEvent) {
    if (typeof onRepos !== 'function') {
      return;
    }
    try {
      const payload = JSON.parse(event.data);
      onRepos(payload);
    } catch (error) {
      console.error('Failed to parse repos event', error);
    }
  }

  function handleSessionsEvent(event: MessageEvent) {
    if (typeof onSessions !== 'function') {
      return;
    }
    try {
      const payload = JSON.parse(event.data);
      onSessions(payload);
    } catch (error) {
      console.error('Failed to parse sessions event', error);
    }
  }

  function handleTasksEvent(event: MessageEvent) {
    if (typeof onTasks !== 'function') {
      return;
    }
    try {
      const payload = JSON.parse(event.data);
      onTasks(payload);
    } catch (error) {
      console.error('Failed to parse tasks event', error);
    }
  }

  function handleConnect() {
    reconnectDelay = 2000;
    if (typeof onConnect === 'function') {
      onConnect();
    }
  }

  function handleDisconnect() {
    if (typeof onDisconnect === 'function') {
      onDisconnect();
    }
  }

  function connect() {
    if (closed) {
      return;
    }
    if (eventSource) {
      try {
        eventSource.close();
      } catch {
        // ignore close errors
      }
      eventSource = null;
    }

    const source = new EventSource('/api/events');
    eventSource = source;

    source.addEventListener('open', handleConnect);
    source.addEventListener('repos:update', handleReposEvent);
    source.addEventListener('sessions:update', handleSessionsEvent);
    source.addEventListener('tasks:update', handleTasksEvent);
    source.addEventListener('error', () => {
      handleDisconnect();
      if (eventSource === source) {
        try {
          source.close();
        } catch {
          // ignore close errors
        }
        eventSource = null;
      }
      clearReconnectTimer();
      scheduleReconnect();
    });
  }

  connect();

  return () => {
    closed = true;
    clearReconnectTimer();
    if (eventSource) {
      try {
        eventSource.close();
      } catch {
        // ignore close errors
      }
      eventSource = null;
    }
  };
}

