import { useState } from 'react';
import * as API from '../api.js';

const initialForm = { name: '', code: '', location: '', description: '', startDate: '', endDate: '', endDateUnknown: true };

export default function ProjectModal({ open, onCancel, onCreated }) {
  const [form, setForm] = useState(initialForm);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const reset = () => {
    setForm(initialForm);
    setError('');
  };

  const handleCancel = () => {
    reset();
    onCancel();
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const name = form.name.trim();
    if (!name) {
      setError('El nombre del proyecto es obligatorio');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const result = await API.createProject({
        name,
        code: form.code.trim() || undefined,
        location: form.location.trim() || undefined,
        description: form.description.trim() || undefined,
        start_date: form.startDate || undefined,
        end_date: form.endDateUnknown ? undefined : form.endDate || undefined,
      });
      reset();
      onCreated(result.data.project);
    } catch (err) {
      setError(err.message || 'Error al crear el proyecto');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div id="project-modal" className={`modal${open ? '' : ' hidden'}`} role="dialog" aria-modal="true" aria-labelledby="project-modal-title">
      <div className="modal__backdrop" onClick={handleCancel} />
      <div className="modal__content project-modal__content">
        <h2 className="modal__title" id="project-modal-title">Crear Nuevo Proyecto</h2>
        <p className="modal__text">Complete los datos del proyecto. Solo el nombre es obligatorio.</p>
        <div id="project-modal-feedback">{error && <div className="alert alert--error">{error}</div>}</div>
        <form id="project-modal-form" onSubmit={handleSubmit}>
          <div className="form__group">
            <label className="form__label" htmlFor="project-modal-name">Nombre del Proyecto *</label>
            <input className="form__input" type="text" id="project-modal-name" required placeholder="Ej: Construcción Sede Chocó" value={form.name} onChange={set('name')} />
          </div>
          <div className="project-modal__row">
            <div className="form__group">
              <label className="form__label" htmlFor="project-modal-code">Código</label>
              <input className="form__input" type="text" id="project-modal-code" placeholder="Ej: PRY-001" value={form.code} onChange={set('code')} />
            </div>
            <div className="form__group">
              <label className="form__label" htmlFor="project-modal-location">Ubicación</label>
              <input className="form__input" type="text" id="project-modal-location" placeholder="Ej: Chocó" value={form.location} onChange={set('location')} />
            </div>
          </div>
          <div className="form__group">
            <label className="form__label" htmlFor="project-modal-description">Descripción</label>
            <textarea className="form__input" id="project-modal-description" rows="2" placeholder="Descripción opcional del proyecto" value={form.description} onChange={set('description')} />
          </div>
          <div className="project-modal__row">
            <div className="form__group">
              <label className="form__label" htmlFor="project-modal-start-date">Fecha de Inicio</label>
              <input className="form__input" type="date" id="project-modal-start-date" value={form.startDate} onChange={set('startDate')} />
            </div>
            <div className="form__group">
              <label className="form__label" htmlFor="project-modal-end-date">Fecha de Fin</label>
              <input
                className="form__input"
                type="date"
                id="project-modal-end-date"
                disabled={form.endDateUnknown}
                value={form.endDate}
                onChange={set('endDate')}
              />
              <label className="form__checkbox-label">
                <input
                  type="checkbox"
                  id="project-end-date-unknown"
                  checked={form.endDateUnknown}
                  onChange={(e) => setForm((f) => ({ ...f, endDateUnknown: e.target.checked, endDate: e.target.checked ? '' : f.endDate }))}
                />
                Fecha no definida aún
              </label>
            </div>
          </div>
          <div className="modal__actions">
            <button className="btn btn--primary" type="submit" id="project-modal-save" disabled={busy}>Crear Proyecto</button>
            <button className="btn btn--outline" type="button" id="project-modal-cancel" onClick={handleCancel}>Cancelar</button>
          </div>
        </form>
      </div>
    </div>
  );
}
