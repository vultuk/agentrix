type EventCallback = (data: unknown) => void;

const listeners = new Map<string, Set<EventCallback>>();

/**
 * Subscribes to an event
 * @param event - Event name
 * @param callback - Callback function
 * @returns Unsubscribe function
 */
export function on(event: string, callback: EventCallback): () => void {
  let callbacks = listeners.get(event);
  if (!callbacks) {
    callbacks = new Set();
    listeners.set(event, callbacks);
  }
  callbacks.add(callback);

  return () => {
    const cbs = listeners.get(event);
    if (cbs) {
      cbs.delete(callback);
      if (cbs.size === 0) {
        listeners.delete(event);
      }
    }
  };
}

/**
 * Emits an event to all subscribers
 * @param event - Event name
 * @param data - Event data
 */
export function emit(event: string, data: unknown): void {
  const callbacks = listeners.get(event);
  if (!callbacks) {
    return;
  }
  callbacks.forEach((callback) => {
    try {
      callback(data);
    } catch (error: unknown) {
      console.error(`[terminal-worktree] Event handler error for ${event}:`, error);
    }
  });
}

/**
 * Event type registry for type-safe event handling
 */
export const EventTypes = {
  REPOS_UPDATE: 'repos:update',
  SESSIONS_UPDATE: 'sessions:update',
  TASKS_UPDATE: 'tasks:update',
} as const;

/**
 * Generic helper to create typed emit/subscribe pairs
 * @param eventName - Event name
 * @returns Object with emit and subscribe functions
 */
function createEventPair(eventName: string) {
  return {
    emit: (data: unknown): void => emit(eventName, data),
    subscribe: (callback: EventCallback): (() => void) => on(eventName, callback),
  };
}

const reposUpdateEvent = createEventPair(EventTypes.REPOS_UPDATE);
const sessionsUpdateEvent = createEventPair(EventTypes.SESSIONS_UPDATE);
const tasksUpdateEvent = createEventPair(EventTypes.TASKS_UPDATE);

/**
 * Emits a repositories update event
 * @param data - Repository data
 */
export function emitReposUpdate(data: unknown): void {
  reposUpdateEvent.emit(data);
}

/**
 * Subscribes to repository updates
 * @param callback - Callback function
 * @returns Unsubscribe function
 */
export function onReposUpdate(callback: EventCallback): () => void {
  return reposUpdateEvent.subscribe(callback);
}

/**
 * Emits a sessions update event
 * @param data - Sessions data
 */
export function emitSessionsUpdate(data: unknown): void {
  sessionsUpdateEvent.emit(data);
}

/**
 * Subscribes to sessions updates
 * @param callback - Callback function
 * @returns Unsubscribe function
 */
export function onSessionsUpdate(callback: EventCallback): () => void {
  return sessionsUpdateEvent.subscribe(callback);
}

/**
 * Emits a tasks update event
 * @param data - Tasks data
 */
export function emitTasksUpdate(data: unknown): void {
  tasksUpdateEvent.emit(data);
}

/**
 * Subscribes to tasks updates
 * @param callback - Callback function
 * @returns Unsubscribe function
 */
export function onTasksUpdate(callback: EventCallback): () => void {
  return tasksUpdateEvent.subscribe(callback);
}

/**
 * Gets all event type constants
 * @returns Event types object
 */
export function getEventTypes() {
  return EventTypes;
}

/**
 * Subscribes to events (alias for on)
 * @param event - Event name
 * @param callback - Callback function
 * @returns Unsubscribe function
 */
export function subscribeToEvents(event: string, callback: EventCallback): () => void {
  return on(event, callback);
}
