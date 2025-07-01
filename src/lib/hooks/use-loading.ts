import React, { useState, useCallback, useRef } from 'react';

interface LoadingState {
  [key: string]: boolean;
}

interface UseLoadingReturn {
  loading: LoadingState;
  isLoading: (key?: string) => boolean;
  setLoading: (key: string, loading: boolean) => void;
  withLoading: <T extends unknown[], R>(
    key: string,
    asyncFn: (...args: T) => Promise<R>
  ) => (...args: T) => Promise<R>;
  reset: () => void;
}

export function useLoading(initialState: LoadingState = {}): UseLoadingReturn {
  const [loading, setLoadingState] = useState<LoadingState>(initialState);
  const loadingRef = useRef(loading);
  loadingRef.current = loading;

  const setLoading = useCallback((key: string, isLoading: boolean) => {
    setLoadingState(prev => ({
      ...prev,
      [key]: isLoading,
    }));
  }, []);

  const isLoading = useCallback((key?: string) => {
    if (key) {
      return Boolean(loadingRef.current[key]);
    }
    return Object.values(loadingRef.current).some(Boolean);
  }, []);

  const withLoading = useCallback(
    <T extends unknown[], R>(
      key: string,
      asyncFn: (...args: T) => Promise<R>
    ) => {
      return async (...args: T): Promise<R> => {
        setLoading(key, true);
        try {
          const result = await asyncFn(...args);
          return result;
        } finally {
          setLoading(key, false);
        }
      };
    },
    [setLoading]
  );

  const reset = useCallback(() => {
    setLoadingState({});
  }, []);

  return {
    loading,
    isLoading,
    setLoading,
    withLoading,
    reset,
  };
}

class GlobalLoadingManager {
  private listeners: Set<(loading: LoadingState) => void> = new Set();
  private loadingState: LoadingState = {};

  subscribe(callback: (loading: LoadingState) => void) {
    this.listeners.add(callback);
    return () => {
      this.listeners.delete(callback);
    };
  }

  setLoading(key: string, loading: boolean) {
    this.loadingState = {
      ...this.loadingState,
      [key]: loading,
    };
    this.notify();
  }

  getLoading(key?: string): boolean {
    if (key) {
      return Boolean(this.loadingState[key]);
    }
    return Object.values(this.loadingState).some(Boolean);
  }

  reset() {
    this.loadingState = {};
    this.notify();
  }

  private notify() {
    this.listeners.forEach(callback => callback(this.loadingState));
  }
}

export const globalLoadingManager = new GlobalLoadingManager();

// Hook for global loading state
function useGlobalLoading() {
  const [loading, setLoadingState] = useState<LoadingState>({});

  React.useEffect(() => {
    return globalLoadingManager.subscribe(setLoadingState);
  }, []);

  const setLoading = useCallback((key: string, isLoading: boolean) => {
    globalLoadingManager.setLoading(key, isLoading);
  }, []);

  const isLoading = useCallback((key?: string) => {
    return globalLoadingManager.getLoading(key);
  }, []);

  const withLoading = useCallback(
    <T extends unknown[], R>(
      key: string,
      asyncFn: (...args: T) => Promise<R>
    ) => {
      return async (...args: T): Promise<R> => {
        setLoading(key, true);
        try {
          const result = await asyncFn(...args);
          return result;
        } finally {
          setLoading(key, false);
        }
      };
    },
    [setLoading]
  );

  return {
    loading,
    isLoading,
    setLoading,
    withLoading,
    reset: globalLoadingManager.reset.bind(globalLoadingManager),
  };
} 
