import { useState, useRef, useMemo } from 'react';
import type { Task } from '../../types/domain.js';

interface UseTasksReturn {
  tasks: Task[];
  setTasks: (tasks: Task[]) => void;
  updateTasks: (tasks: Task[]) => void;
  isTaskMenuOpen: boolean;
  setIsTaskMenuOpen: (open: boolean) => void;
  toggleTaskMenu: () => void;
  closeTaskMenu: () => void;
  taskMapRef: React.MutableRefObject<Map<string, Task>>;
  taskMenuRef: React.MutableRefObject<HTMLDivElement | null>;
  hasRunningTasks: boolean;
}

/**
 * Custom hook for managing tasks state
 */
export function useTasks(): UseTasksReturn {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [isTaskMenuOpen, setIsTaskMenuOpen] = useState(false);
  const taskMapRef = useRef<Map<string, Task>>(new Map());
  const taskMenuRef = useRef<HTMLDivElement | null>(null);

  const hasRunningTasks = useMemo(
    () => tasks.some((task) => task && (task.status === 'pending' || task.status === 'running')),
    [tasks],
  );

  const toggleTaskMenu = () => {
    setIsTaskMenuOpen((prev) => !prev);
  };

  const closeTaskMenu = () => {
    setIsTaskMenuOpen(false);
  };

  const updateTasks = (newTasks: Task[]) => {
    setTasks(newTasks);
  };

  return {
    tasks,
    setTasks,
    updateTasks,
    isTaskMenuOpen,
    setIsTaskMenuOpen,
    toggleTaskMenu,
    closeTaskMenu,
    taskMapRef,
    taskMenuRef,
    hasRunningTasks,
  };
}

