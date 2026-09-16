/* ============================================
   CID Aprueba — Toast notifications
   ============================================ */
import { createContext, useCallback, useContext, useRef, useState } from 'react';

const ToastContext = createContext(null);

const TOAST_ICONS = { success: '✓', error: '✗', warning: '⚠', info: 'ℹ' };
const RESUME_DELAY = 2000; // ms left after the pointer leaves the toast
const EXIT_ANIMATION_MS = 400; // fallback removal if animationend never fires
let nextId = 1;

function Toast({ toast, onDismiss }) {
  const [dismissing, setDismissing] = useState(false);
  const timerRef = useRef(null);
  const removeTimerRef = useRef(null);

  const startDismiss = useCallback(() => {
    setDismissing((already) => {
      if (already) return already;
      removeTimerRef.current = setTimeout(() => onDismiss(toast.id), EXIT_ANIMATION_MS);
      return true;
    });
  }, [onDismiss, toast.id]);

  const clear = () => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };
  const schedule = (ms) => {
    clear();
    timerRef.current = setTimeout(startDismiss, ms);
  };

  // Schedule on mount only
  const scheduledRef = useRef(false);
  if (!scheduledRef.current) {
    scheduledRef.current = true;
    schedule(toast.duration);
  }

  return (
    <div
      className={`toast toast--${toast.type}${dismissing ? ' toast--dismissing' : ''}`}
      role="alert"
      onMouseEnter={clear}
      onMouseLeave={() => schedule(RESUME_DELAY)}
      onAnimationEnd={() => {
        if (dismissing) onDismiss(toast.id);
      }}
    >
      <span className="toast__icon">{TOAST_ICONS[toast.type] || TOAST_ICONS.info}</span>
      <span className="toast__message">{toast.message}</span>
      <button className="toast__close" aria-label="Cerrar" onClick={() => { clear(); startDismiss(); }}>
        &times;
      </button>
      <div className="toast__progress" />
    </div>
  );
}

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const showToast = useCallback((message, type = 'info', duration = 4000) => {
    const id = nextId++;
    setToasts((current) => [...current, { id, message, type, duration }]);
  }, []);

  const dismiss = useCallback((id) => {
    setToasts((current) => current.filter((t) => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div className="toast-container" id="toast-container" aria-live="polite" aria-atomic="false">
        {toasts.map((toast) => (
          <Toast key={toast.id} toast={toast} onDismiss={dismiss} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}
