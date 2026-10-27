'use client';
import { useEffect, useState } from 'react';
import { apiRequest } from '@/lib/api-client';
export function useTaskChoices(weddingId, kind) {
  const [page, setPage] = useState(1),
    [retry, setRetry] = useState(0);
  const [choices, setChoices] = useState({ rows: [], totalPages: 1 });
  const [result, setResult] = useState(null);
  const key = `${weddingId}:${page}:${retry}`;
  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    const path = kind === 'members' ? 'tasks/assignees' : 'events';
    void apiRequest(`/weddings/${weddingId}/${path}?page=${page}&limit=100`, {
      signal: controller.signal,
    })
      .then((response) => {
        if (!active) return;
        const rows = response.data[kind];
        setChoices((previous) => ({
          rows:
            page === 1
              ? rows
              : [
                  ...previous.rows,
                  ...rows.filter(
                    (row) => !previous.rows.some((old) => old.id === row.id),
                  ),
                ],
          totalPages: response.meta.totalPages,
        }));
        setResult({ key });
      })
      .catch((error) => {
        if (active) setResult({ key, error: error.message });
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [weddingId, kind, page, key]);
  return {
    ...choices,
    page,
    loading: result?.key !== key,
    error: result?.key === key ? result.error : '',
    more: () => setPage((value) => value + 1),
    retry: () => setRetry((value) => value + 1),
    refresh: () => {
      setPage(1);
      setRetry((value) => value + 1);
    },
  };
}
