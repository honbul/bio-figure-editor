import { useState, useCallback } from 'react';
import { Layer } from '@/types';

export function useHistory(initialLayers: Layer[] = []) {
  const [layers, setLayers] = useState<Layer[]>(initialLayers);
  const [history, setHistory] = useState<Layer[][]>([initialLayers]);
  const [historyIndex, setHistoryIndex] = useState(0);

  const updateLayers = useCallback((newLayers: Layer[]) => {
    setLayers(newLayers);
    const newHistory = history.slice(0, historyIndex + 1);
    newHistory.push(newLayers);
    if (newHistory.length > 50) newHistory.shift();
    setHistory(newHistory);
    setHistoryIndex(newHistory.length - 1);
  }, [history, historyIndex]);

  const undo = useCallback(() => {
    if (historyIndex > 0) {
      const prevIndex = historyIndex - 1;
      setHistoryIndex(prevIndex);
      setLayers(history[prevIndex]);
    }
  }, [history, historyIndex]);

  const redo = useCallback(() => {
    if (historyIndex < history.length - 1) {
      const nextIndex = historyIndex + 1;
      setHistoryIndex(nextIndex);
      setLayers(history[nextIndex]);
    }
  }, [history, historyIndex]);

  return {
    layers,
    setLayers,
    updateLayers,
    undo,
    redo,
    canUndo: historyIndex > 0,
    canRedo: historyIndex < history.length - 1,
  };
}
