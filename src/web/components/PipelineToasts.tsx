import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Toast, Frame } from '@shopify/polaris';

/**
 * Global pipeline toast notifications.
 * Connects to `/api/pipeline/stream` SSE and shows toasts
 * for pipeline lifecycle events. Works across all pages.
 */

interface ToastEntry {
  id: string;
  content: string;
  error?: boolean;
  duration?: number;
}

const PipelineToasts: React.FC = () => {
  const [toasts, setToasts] = useState<ToastEntry[]>([]);
  const shownRef = useRef<Set<string>>(new Set());
  // Track last progress detail per job to avoid spamming toasts
  const lastProgressRef = useRef<Map<string, string>>(new Map());

  const addToast = useCallback((content: string, error = false, duration = 5000) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    setToasts((prev) => [...prev, { id, content, error, duration }]);
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  useEffect(() => {
    const es = new EventSource('/api/pipeline/stream');

    es.onmessage = (msg) => {
      try {
        const data = JSON.parse(msg.data);
        const { jobId, step, status, detail, progress, jobStatus, shopifyTitle } = data;
        const name = shopifyTitle || jobId;

        // Pipeline started
        if (step === 'fetch_product' && status === 'running') {
          const key = `start-${jobId}`;
          if (!shownRef.current.has(key)) {
            shownRef.current.add(key);
            addToast(`Pipeline started for ${name}`);
          }
        }

        // Image progress (throttle to every other image)
        if (step === 'process_images' && progress && status === 'running') {
          const progressKey = `${progress.current}/${progress.total}`;
          const lastKey = lastProgressRef.current.get(jobId);
          if (progressKey !== lastKey && (progress.current === 1 || progress.current % 2 === 0 || progress.current === progress.total)) {
            lastProgressRef.current.set(jobId, progressKey);
            addToast(`${name}: Photo ${progress.current}/${progress.total}`, false, 3000);
          }
        }

        // TIM condition found
        if (step === 'generate_description' && detail?.includes('condition:')) {
          const key = `tim-${jobId}`;
          if (!shownRef.current.has(key)) {
            shownRef.current.add(key);
            addToast(`${name}: ${detail}`, false, 4000);
          }
        }

        // Completed
        if (jobStatus === 'completed') {
          const key = `done-${jobId}`;
          if (!shownRef.current.has(key)) {
            shownRef.current.add(key);
            addToast(`✅ Draft ready for review — ${name}`, false, 8000);
          }
        }

        // Failed
        if (jobStatus === 'failed') {
          const key = `fail-${jobId}`;
          if (!shownRef.current.has(key)) {
            shownRef.current.add(key);
            addToast(`❌ Pipeline failed: ${detail || 'unknown error'} — ${name}`, true, 10000);
          }
        }
      } catch {}
    };

    return () => es.close();
  }, [addToast]);

  // Only render the most recent toast (Polaris Toast stacks poorly)
  const current = toasts[0];
  if (!current) return null;

  return (
    <Toast
      content={current.content}
      error={current.error}
      duration={current.duration}
      onDismiss={() => removeToast(current.id)}
    />
  );
};

export default PipelineToasts;
