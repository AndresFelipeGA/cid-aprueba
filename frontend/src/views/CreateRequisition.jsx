/* ============================================
   CID Aprueba — Create requisition view (+ create project modal)
   ============================================ */
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import * as API from '../api.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useMeta } from '../context/MetaContext.jsx';
import { usePageTitle } from '../context/PageTitleContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { formatBytes, getFileExtension } from '../utils/format.js';
import ProjectModal from '../components/ProjectModal.jsx';

const IMAGE_EXTS = ['jpg', 'jpeg', 'png', 'gif', 'svg', 'webp', 'bmp'];
const OFFICE_ICONS = {
  doc: { color: '#2B579A', label: 'WORD' },
  docx: { color: '#2B579A', label: 'WORD' },
  xls: { color: '#217346', label: 'EXCEL' },
  xlsx: { color: '#217346', label: 'EXCEL' },
  ppt: { color: '#D24726', label: 'PPT' },
  pptx: { color: '#D24726', label: 'PPT' },
};

function FileIcon({ color, size, withLines }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      {withLines && (
        <>
          <line x1="16" y1="13" x2="8" y2="13" />
          <line x1="16" y1="17" x2="8" y2="17" />
        </>
      )}
    </svg>
  );
}

function FilePreviewInfo({ file }) {
  return (
    <div className="upload-preview__info">
      <div className="upload-preview__filename">{file.name}</div>
      <div className="upload-preview__filesize">{formatBytes(file.size)}</div>
    </div>
  );
}

function FilePreview({ file }) {
  const [url, setUrl] = useState(null);
  useEffect(() => {
    if (!file) return;
    const ext = getFileExtension(file.name);
    if (IMAGE_EXTS.includes(ext) || ext === 'pdf') {
      const objectUrl = URL.createObjectURL(file);
      setUrl(objectUrl);
      return () => URL.revokeObjectURL(objectUrl);
    }
    setUrl(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file]);

  if (!file) {
    return (
      <div className="upload-preview__empty">
        <FileIcon color="currentColor" size={48} withLines={false} />
        <p>Selecciona un archivo para ver la vista previa</p>
      </div>
    );
  }

  const ext = getFileExtension(file.name);
  if (IMAGE_EXTS.includes(ext) && url) {
    return (
      <>
        <div className="upload-preview__image-wrap">
          <img src={url} alt={file.name} className="upload-preview__image" />
        </div>
        <FilePreviewInfo file={file} />
      </>
    );
  }
  if (ext === 'pdf' && url) {
    return (
      <>
        <div className="upload-preview__pdf-wrap">
          <iframe src={`${url}#toolbar=0&navpanes=0&scrollbar=1&zoom=63`} className="upload-preview__pdf" title="Vista previa PDF" />
        </div>
        <FilePreviewInfo file={file} />
      </>
    );
  }
  const icon = OFFICE_ICONS[ext] || { color: 'var(--color-text-light)', label: ext.toUpperCase() };
  return (
    <>
      <div className="upload-preview__file-icon">
        <FileIcon color={icon.color} size={64} withLines />
        <span className="upload-preview__file-ext" style={{ color: icon.color }}>{icon.label}</span>
      </div>
      <FilePreviewInfo file={file} />
    </>
  );
}

function FileDropArea({ file, onFile, inputId }) {
  const inputRef = useRef(null);
  const [active, setActive] = useState(false);
  const { acceptAttr } = useMeta();

  const openPicker = () => inputRef.current && inputRef.current.click();

  return (
    <div
      className={`upload-form__file-area${active ? ' upload-form__file-area--active' : ''}`}
      role="button"
      tabIndex={0}
      aria-label="Seleccionar archivo"
      onClick={openPicker}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openPicker(); } }}
      onDragOver={(e) => { e.preventDefault(); setActive(true); }}
      onDragLeave={() => setActive(false)}
      onDrop={(e) => {
        e.preventDefault();
        setActive(false);
        if (e.dataTransfer.files.length > 0) onFile(e.dataTransfer.files[0]);
      }}
    >
      <div className="upload-form__file-text">Haz clic o arrastra un archivo aquí</div>
      <input
        type="file"
        id={inputId}
        style={{ display: 'none' }}
        accept={acceptAttr()}
        ref={inputRef}
        onChange={(e) => { if (e.target.files.length > 0) onFile(e.target.files[0]); }}
      />
      <div className="upload-form__file-name" id="file-name">{file ? file.name : ''}</div>
    </div>
  );
}

export default function CreateRequisition() {
  usePageTitle('Crear Requisición');
  const { user } = useAuth();
  const navigate = useNavigate();
  const { showToast } = useToast();

  const [projects, setProjects] = useState([]);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [budgetCap, setBudgetCap] = useState('');
  const [projectId, setProjectId] = useState('');
  const [file, setFile] = useState(null);
  const [feedback, setFeedback] = useState(null);
  const [busy, setBusy] = useState(false);
  const [projectModalOpen, setProjectModalOpen] = useState(false);

  const authorized = Boolean(user && user.role_level === 1);

  useEffect(() => {
    if (!authorized) return;
    API.getProjects().then((result) => setProjects(result.data.projects || [])).catch(() => {});
  }, [authorized]);

  useEffect(() => {
    if (authorized) return;
    const timer = setTimeout(() => navigate('/dashboard'), 2000);
    return () => clearTimeout(timer);
  }, [authorized, navigate]);

  if (!authorized) {
    return <div className="alert alert--error">No tiene permisos para crear requisiciones. Solo los Coordinadores/as de Territorio pueden crear requisiciones.</div>;
  }

  const handleProjectSelectChange = (e) => {
    if (e.target.value === 'new') {
      setProjectId('');
      setProjectModalOpen(true);
    } else {
      setProjectId(e.target.value);
    }
  };

  const handleProjectCreated = (project) => {
    setProjects((list) => [...list, project]);
    setProjectId(String(project.id));
    setProjectModalOpen(false);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const trimmedTitle = title.trim();
    // An empty field means "no hay presupuesto definido", same as explicitly typing 0.
    const budget = budgetCap.trim() === '' ? 0 : Number(budgetCap);
    if (!trimmedTitle) {
      setFeedback({ type: 'error', message: 'El título es obligatorio' });
      return;
    }
    if (Number.isNaN(budget) || budget < 0) {
      setFeedback({ type: 'error', message: 'El presupuesto máximo no puede ser un número negativo' });
      return;
    }
    if (!file) {
      setFeedback({ type: 'error', message: 'Debe seleccionar un archivo' });
      return;
    }

    const formData = new FormData();
    formData.append('title', trimmedTitle);
    formData.append('description', description.trim());
    formData.append('budget_cap', String(budget));
    if (projectId) formData.append('project_id', projectId);
    formData.append('file', file);

    setBusy(true);
    setFeedback(null);
    try {
      const result = await API.createRequisition(formData);
      const created = result.data.requisition;
      const message = result.message || `Requisición ${created.number || ''} radicada exitosamente`.replace('  ', ' ');
      setFeedback({ type: 'success', message });
      showToast(message, 'success');
      setTimeout(() => navigate(`/requisitions/${created.id}`), 1500);
    } catch (err) {
      setFeedback({ type: 'error', message: err.message || 'Error al crear la requisición' });
      setBusy(false);
    }
  };

  return (
    <>
      <a href="/#/requisitions" className="back-link" onClick={(e) => { e.preventDefault(); navigate('/requisitions'); }}>&larr; Volver a requisiciones</a>

      <div className="upload-layout">
        <div className="upload-form">
          <h2 className="main__title" style={{ marginBottom: 24 }}>Crear Requisición</h2>
          <div id="upload-feedback">
            {feedback && <div className={`alert alert--${feedback.type}`}>{feedback.message}</div>}
          </div>
          <form id="upload-form" onSubmit={handleSubmit}>
            <div className="form__group">
              <label className="form__label" htmlFor="upload-title">Título</label>
              <input className="form__input" type="text" id="upload-title" required maxLength={255} placeholder="Título de la requisición" value={title} onChange={(e) => setTitle(e.target.value)} />
            </div>
            <div className="form__group">
              <label className="form__label" htmlFor="upload-description">Descripción</label>
              <textarea className="form__input" id="upload-description" rows={3} maxLength={1000} placeholder="Descripción opcional de la requisición" value={description} onChange={(e) => setDescription(e.target.value)} />
            </div>
            <div className="form__group">
              <div className="form__label-row">
                <label className="form__label" htmlFor="upload-budget-cap">Presupuesto Máximo (COP)</label>
                <span className="form__label-optional">Opcional</span>
              </div>
              <input
                className="form__input"
                type="number"
                id="upload-budget-cap"
                min="0"
                step="1"
                inputMode="numeric"
                placeholder="Ej: 5000000"
                value={budgetCap}
                onChange={(e) => setBudgetCap(e.target.value)}
              />
              {budgetCap.trim() !== '' && Number(budgetCap) !== 0 && (
                <p className="form__hint">Las cotizaciones de proveedores no podrán superar este valor.</p>
              )}
            </div>
            <div className="form__group">
              <label className="form__label" htmlFor="upload-project">Proyecto</label>
              <select className="form__input project-select" id="upload-project" value={projectId} onChange={handleProjectSelectChange}>
                <option value="">Seleccione un proyecto...</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}{p.code ? ` (${p.code})` : ''}</option>
                ))}
                <option value="new" className="project-select__new-option">+ Crear nuevo proyecto</option>
              </select>
            </div>
            <div className="form__group">
              <label className="form__label" htmlFor="upload-file">Archivo</label>
              <FileDropArea file={file} onFile={setFile} inputId="upload-file" />
            </div>
            <button className="btn btn--primary btn--block" type="submit" id="upload-btn" disabled={busy}>
              {busy ? 'Creando...' : 'Crear Requisición'}
            </button>
          </form>
        </div>

        <div className="upload-preview" id="upload-preview">
          <div className="upload-preview__header">Vista previa</div>
          <div className="upload-preview__body" id="preview-body">
            <FilePreview file={file} />
          </div>
        </div>
      </div>

      <ProjectModal open={projectModalOpen} onCancel={() => setProjectModalOpen(false)} onCreated={handleProjectCreated} />
    </>
  );
}
