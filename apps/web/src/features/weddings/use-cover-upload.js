'use client';

import { useEffect, useRef, useState } from 'react';
import { performCoverUpload } from './cover-upload';
import { coverFileError, defaultFrame } from './cover-data';

export function useCoverUpload({ weddingId, onSelection } = {}) {
  const [selection, setSelection] = useState(null);
  const [frame, setFrame] = useState(defaultFrame);
  const [error, setError] = useState('');
  const [progress, setProgress] = useState(null);
  const receipt = useRef(null);
  const controller = useRef(null);
  const url = selection?.url;
  useEffect(
    () => () => {
      if (url) URL.revokeObjectURL(url);
    },
    [url],
  );
  useEffect(() => () => controller.current?.abort(), []);
  function choose(file) {
    if (!file) return;
    const invalid = coverFileError(file);
    if (invalid) {
      setError(invalid);
      return;
    }
    receipt.current = null;
    setError('');
    setProgress(null);
    setFrame(defaultFrame);
    setSelection({ file, url: URL.createObjectURL(file) });
    onSelection?.();
  }
  function reset() {
    receipt.current = null;
    setSelection(null);
    setFrame(defaultFrame);
    setError('');
    setProgress(null);
    onSelection?.();
  }
  function invalidate() {
    receipt.current = null;
    setProgress(null);
  }
  async function upload() {
    if (!selection) return undefined;
    if (error) throw new Error(error);
    controller.current?.abort();
    const active = new AbortController();
    controller.current = active;
    const base = weddingId
      ? `/weddings/${weddingId}/media`
      : '/media/wedding-cover';
    try {
      return await performCoverUpload({
        receipt,
        file: selection.file,
        base,
        signal: active.signal,
        onProgress: setProgress,
      });
    } finally {
      if (controller.current === active) controller.current = null;
    }
  }
  return {
    selection,
    frame,
    setFrame,
    error,
    setError,
    progress,
    choose,
    reset,
    invalidate,
    upload,
  };
}
