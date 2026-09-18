/* ============================================
   CID Aprueba — Profile view
   ============================================ */
import { useState } from 'react';
import * as API from '../api.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useMeta } from '../context/MetaContext.jsx';
import { usePageTitle } from '../context/PageTitleContext.jsx';

export default function Profile() {
  usePageTitle('Mi Perfil');
  const { user, setUser } = useAuth();
  const { roleName, genderOptions } = useMeta();
  const [fullName, setFullName] = useState(user.full_name);
  const [email, setEmail] = useState(user.email || '');
  const [gender, setGender] = useState(user.gender || '');
  const [feedback, setFeedback] = useState(null);
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const trimmedName = fullName.trim();
    if (!trimmedName || trimmedName.length < 2) {
      setFeedback({ type: 'error', message: 'El nombre debe tener al menos 2 caracteres' });
      return;
    }
    if (!email.trim()) {
      setFeedback({ type: 'error', message: 'Ingrese un correo electrónico válido' });
      return;
    }
    setBusy(true);
    setFeedback({ type: 'error', message: '' });
    try {
      const result = await API.updateProfile({ email: email.trim(), full_name: trimmedName, gender: gender || null });
      setUser(result.data.user);
      setFeedback({ type: 'success', message: 'Perfil actualizado exitosamente' });
    } catch (err) {
      setFeedback({ type: 'error', message: err.message || 'Error al actualizar el perfil' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="profile">
      <div className="profile__card">
        <h2 className="profile__title">Información del Usuario</h2>
        <div id="profile-feedback">
          {feedback && feedback.message && <div className={`alert alert--${feedback.type}`}>{feedback.message}</div>}
        </div>
        <form id="profile-form" onSubmit={handleSubmit}>
          <div className="user-form-grid">
            <div className="form__group">
              <label className="form__label" htmlFor="profile-username">Usuario</label>
              <input className="form__input" type="text" id="profile-username" value={user.username} disabled readOnly />
            </div>
            <div className="form__group">
              <label className="form__label" htmlFor="profile-role">Rol</label>
              <input className="form__input" type="text" id="profile-role" value={roleName(user.role_level, user.gender)} disabled readOnly />
            </div>
            <div className="form__group">
              <label className="form__label" htmlFor="profile-fullname">Nombre completo</label>
              <input className="form__input" type="text" id="profile-fullname" required minLength={2} placeholder="Nombre completo" value={fullName} onChange={(e) => setFullName(e.target.value)} />
            </div>
            <div className="form__group">
              <label className="form__label" htmlFor="profile-email">Correo electrónico</label>
              <input className="form__input" type="email" id="profile-email" required placeholder="ejemplo@correo.com" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div className="form__group">
              <label className="form__label" htmlFor="profile-gender">Género</label>
              <select className="form__input" id="profile-gender" value={gender} onChange={(e) => setGender(e.target.value)}>
                {genderOptions.map((o) => <option key={o.value || 'none'} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            {user.territory && (
              <div className="form__group">
                <label className="form__label" htmlFor="profile-territory">Territorio</label>
                <input className="form__input" type="text" id="profile-territory" value={user.territory} disabled readOnly />
              </div>
            )}
          </div>
          <div className="user-form-actions">
            <button className="btn btn--primary" type="submit" id="profile-save-btn" disabled={busy}>Guardar cambios</button>
          </div>
        </form>
      </div>
    </div>
  );
}
