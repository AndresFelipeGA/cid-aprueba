import { useEffect, useState } from 'react';
import * as API from '../api.js';
import { useAuth } from '../context/AuthContext.jsx';

export default function EmailModal() {
  const { user, setUser } = useAuth();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!user) return;
    const userEmail = user.email || '';
    if (!userEmail || userEmail.endsWith('@cid.org.co')) {
      setOpen(true);
    }
    // Only re-evaluate when the logged-in user identity changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user && user.id]);

  const hide = () => {
    setOpen(false);
    setError('');
    setEmail('');
  };

  const handleSave = async (e) => {
    e.preventDefault();
    const value = email.trim();
    if (!value) {
      setError('Ingrese un correo electrónico válido');
      return;
    }
    setBusy(true);
    try {
      const result = await API.updateProfile({ email: value });
      setUser(result.data.user);
      hide();
    } catch (err) {
      setError(err.message || 'Error al guardar el correo');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div id="email-modal" className={`modal${open ? '' : ' hidden'}`} role="dialog" aria-modal="true" aria-labelledby="email-modal-title">
      <div className="modal__backdrop" onClick={hide} />
      <div className="modal__content">
        <h2 className="modal__title" id="email-modal-title">Registra tu correo electrónico</h2>
        <p className="modal__text">Para mejorar la comunicación, por favor registra tu correo electrónico.</p>
        <div id="email-modal-feedback">{error && <div className="alert alert--error">{error}</div>}</div>
        <form id="email-modal-form" onSubmit={handleSave}>
          <div className="form__group">
            <label className="form__label" htmlFor="email-modal-input">Correo electrónico</label>
            <input
              className="form__input"
              type="email"
              id="email-modal-input"
              required
              placeholder="ejemplo@correo.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="modal__actions">
            <button className="btn btn--primary" type="submit" id="email-modal-save" disabled={busy}>Guardar</button>
            <button className="btn btn--outline" type="button" id="email-modal-skip" onClick={hide}>Omitir</button>
          </div>
        </form>
      </div>
    </div>
  );
}
