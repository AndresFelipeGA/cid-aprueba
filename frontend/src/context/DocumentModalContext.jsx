/* ============================================
   CID Aprueba — Document preview modal (PDF / image / download fallback)
   ============================================ */
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { getFileExtension } from '../utils/format.js';

const DocumentModalContext = createContext(null);

export function DocumentModalProvider({ children }) {
  const [state, setState] = useState({ open: false, filename: '', status: 'idle', blobUrl: null, error: null });
  const openerRef = useRef(null);
  const blobUrlRef = useRef(null);

  const close = useCallback(() => {
    if (blobUrlRef.current) {
      URL.revokeObjectURL(blobUrlRef.current);
      blobUrlRef.current = null;
    }
    setState({ open: false, filename: '', status: 'idle', blobUrl: null, error: null });
    const opener = openerRef.current;
    openerRef.current = null;
    if (opener && typeof opener.focus === 'function' && document.contains(opener)) {
      opener.focus();
    }
  }, []);

  const openDocumentModal = useCallback(async (fetchFn, filename) => {
    openerRef.current = document.activeElement;
    setState({ open: true, filename, status: 'loading', blobUrl: null, error: null });
    try {
      const response = await fetchFn();
      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);
      blobUrlRef.current = blobUrl;
      setState({ open: true, filename, status: 'loaded', blobUrl, error: null });
    } catch (_err) {
      setState({ open: true, filename, status: 'error', blobUrl: null, error: _err });
    }
  }, []);

  useEffect(() => {
    const onKeydown = (e) => {
      if (e.key === 'Escape' && state.open) close();
    };
    document.addEventListener('keydown', onKeydown);
    return () => document.removeEventListener('keydown', onKeydown);
  }, [state.open, close]);

  const ext = getFileExtension(state.filename);
  const isImage = ['jpg', 'jpeg', 'png'].includes(ext);
  const isPdf = ext === 'pdf';

  let body;
  if (state.status === 'loading') {
    body = (
      <div className="document-modal__loading">
        <div className="loading__spinner" />
        <span>Cargando vista previa...</span>
      </div>
    );
  } else if (state.status === 'loaded' && isPdf) {
    body = <iframe src={`${state.blobUrl}#toolbar=1&navpanes=0&scrollbar=1&zoom=63`} title="Vista previa PDF" />;
  } else if (state.status === 'loaded' && isImage) {
    body = <img src={state.blobUrl} alt={state.filename} />;
  } else if (state.status === 'loaded') {
    body = (
      <div className="document-modal__error">
        <p>Vista previa no disponible para este tipo de archivo.</p>
        <p style={{ marginTop: 8, fontWeight: 500 }}>{state.filename}</p>
      </div>
    );
  } else if (state.status === 'error') {
    const what = isPdf ? 'la vista previa del archivo' : isImage ? 'la vista previa de la imagen' : 'el archivo';
    body = <div className="document-modal__error"><p>Error al cargar {what}.</p></div>;
  }

  return (
    <DocumentModalContext.Provider value={openDocumentModal}>
      {children}
      <div
        id="document-modal"
        className="document-modal"
        style={{ display: state.open ? 'flex' : 'none' }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="document-modal-title"
      >
        <div className="document-modal__backdrop" onClick={close} />
        <div className="document-modal__container">
          <div className="document-modal__header">
            <h3 className="document-modal__title" id="document-modal-title" title={state.filename}>{state.filename}</h3>
            <div className="document-modal__header-actions">
              {state.status === 'loaded' && (
                <a
                  className="btn btn--outline btn--sm document-modal__download"
                  id="document-modal-download"
                  href={state.blobUrl}
                  download={state.filename || (isPdf ? 'archivo.pdf' : isImage ? 'imagen' : 'archivo')}
                  aria-label="Descargar"
                >
                  ⬇ Descargar
                </a>
              )}
              <button className="document-modal__close" id="document-modal-close" aria-label="Cerrar" onClick={close}>
                &times;
              </button>
            </div>
          </div>
          <div className="document-modal__body" id="document-modal-body">{body}</div>
        </div>
      </div>
    </DocumentModalContext.Provider>
  );
}

export function useDocumentModal() {
  return useContext(DocumentModalContext);
}
