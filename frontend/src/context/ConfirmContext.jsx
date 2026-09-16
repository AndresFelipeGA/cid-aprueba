/* ============================================
   CID Aprueba — Confirmation dialog (replaces window.confirm)
   ============================================ */
import { createContext, useCallback, useContext, useRef, useState } from 'react';

const ConfirmContext = createContext(null);

export function ConfirmProvider({ children }) {
  const dialogRef = useRef(null);
  const resolveRef = useRef(null);
  const [message, setMessage] = useState('');

  const confirm = useCallback((msg) => {
    const dialog = dialogRef.current;
    if (!dialog || typeof dialog.showModal !== 'function') {
      return Promise.resolve(window.confirm(msg));
    }
    setMessage(msg);
    return new Promise((resolve) => {
      resolveRef.current = resolve;
      // Let the message paint before opening
      requestAnimationFrame(() => {
        dialog.returnValue = '';
        dialog.showModal();
        const accept = dialog.querySelector('#confirm-dialog-accept');
        if (accept) accept.focus();
      });
    });
  }, []);

  const handleClose = () => {
    const dialog = dialogRef.current;
    if (resolveRef.current) resolveRef.current(dialog.returnValue === 'confirm');
    resolveRef.current = null;
  };

  const handleBackdropClick = (e) => {
    if (e.target === dialogRef.current) dialogRef.current.close('');
  };

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <dialog
        id="confirm-dialog"
        className="confirm-dialog"
        aria-labelledby="confirm-dialog-message"
        ref={dialogRef}
        onClose={handleClose}
        onClick={handleBackdropClick}
      >
        <form method="dialog">
          <p className="modal__text" id="confirm-dialog-message">{message}</p>
          <div className="modal__actions">
            <button className="btn btn--outline" type="submit" value="cancel">Cancelar</button>
            <button className="btn btn--primary" type="submit" value="confirm" id="confirm-dialog-accept">Aceptar</button>
          </div>
        </form>
      </dialog>
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  return useContext(ConfirmContext);
}
