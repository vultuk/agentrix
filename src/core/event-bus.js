import { EventEmitter } from 'node:events';

const eventBus = new EventEmitter();

const EVENTS = Object.freeze({
  REPOS_UPDATE: 'repos:update',
  SESSIONS_UPDATE: 'sessions:update',
  TASKS_UPDATE: 'tasks:update',
});

eventBus.setMaxListeners(50);

export function emitReposUpdate(payload) {
  eventBus.emit(EVENTS.REPOS_UPDATE, payload);
}

export function emitSessionsUpdate(payload) {
  eventBus.emit(EVENTS.SESSIONS_UPDATE, payload);
}

export function emitTasksUpdate(payload) {
  eventBus.emit(EVENTS.TASKS_UPDATE, payload);
}

export function subscribeToEvents(event, listener) {
  eventBus.on(event, listener);
  return () => {
    eventBus.off(event, listener);
  };
}

export function getEventTypes() {
  return EVENTS;
}

export function once(event) {
  return new Promise((resolve) => {
    const handler = (payload) => {
      eventBus.off(event, handler);
      resolve(payload);
    };
    eventBus.on(event, handler);
  });
}

export const _internals = {
  bus: eventBus,
};
