/* ============================================
   CID Aprueba — User management view (role 3)
   ============================================ */
import { useEffect, useRef, useState } from 'react';
import Loading from '../components/Loading.jsx';
import { useNavigate } from 'react-router-dom';
import * as API from '../api.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useMeta } from '../context/MetaContext.jsx';
import { usePageTitle } from '../context/PageTitleContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { useConfirm } from '../context/ConfirmContext.jsx';
import FilterableTable from '../components/FilterableTable.jsx';

function Alert({ type, message }) {
  if (!message) return null;
  return <div className={`alert alert--${type}`}>{message}</div>;
}

function GenderSelect({ id, value, onChange }) {
  const { genderOptions } = useMeta();
  return (
    <select className="form__input" id={id} value={value} onChange={onChange}>
      {genderOptions.map((o) => <option key={o.value || 'none'} value={o.value}>{o.label}</option>)}
    </select>
  );
}

function CreateUserPanel({ open, onCancel, onCreated }) {
  const [form, setForm] = useState({ username: '', email: '', password: '', fullName: '', roleLevel: '', territory: '', gender: '' });
  const [feedback, setFeedback] = useState(null);
  const [busy, setBusy] = useState(false);
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const reset = () => {
    setForm({ username: '', email: '', password: '', fullName: '', roleLevel: '', territory: '', gender: '' });
    setFeedback(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const { username, email, password, fullName, roleLevel, territory, gender } = form;
    if (!username || !email || !password || !fullName || !roleLevel) {
      setFeedback({ type: 'error', message: 'Todos los campos obligatorios deben ser completados' });
      return;
    }
    if (password.length < 8) {
      setFeedback({ type: 'error', message: 'La contraseña debe tener al menos 8 caracteres' });
      return;
    }
    setBusy(true);
    setFeedback(null);
    try {
      await API.createUser({
        username: username.trim(),
        email: email.trim(),
        password,
        full_name: fullName.trim(),
        role_level: parseInt(roleLevel, 10),
        territory: territory.trim() || null,
        gender: gender || null,
      });
      setFeedback({ type: 'success', message: 'Usuario creado exitosamente' });
      setTimeout(() => { reset(); onCreated(); }, 1000);
    } catch (err) {
      setFeedback({ type: 'error', message: err.message || 'Error al crear el usuario' });
      setBusy(false);
    }
  };

  return (
    <div className={`user-form-panel${open ? '' : ' hidden'}`} id="create-user-panel">
      <h3 className="user-form-panel__title">Crear Nuevo Usuario</h3>
      <div id="create-user-feedback"><Alert {...(feedback || {})} /></div>
      <form id="create-user-form" onSubmit={handleSubmit}>
        <div className="user-form-grid">
          <div className="form__group">
            <label className="form__label" htmlFor="create-username">Usuario</label>
            <input className="form__input" type="text" id="create-username" required placeholder="usuario.nombre" pattern="[a-zA-Z0-9.]+" value={form.username} onChange={set('username')} />
          </div>
          <div className="form__group">
            <label className="form__label" htmlFor="create-email">Email</label>
            <input className="form__input" type="email" id="create-email" required placeholder="correo@ejemplo.com" value={form.email} onChange={set('email')} />
          </div>
          <div className="form__group">
            <label className="form__label" htmlFor="create-password">Contraseña</label>
            <input className="form__input" type="password" id="create-password" required minLength={8} placeholder="Mínimo 8 caracteres" value={form.password} onChange={set('password')} />
          </div>
          <div className="form__group">
            <label className="form__label" htmlFor="create-fullname">Nombre Completo</label>
            <input className="form__input" type="text" id="create-fullname" required placeholder="Nombre completo" value={form.fullName} onChange={set('fullName')} />
          </div>
          <div className="form__group">
            <label className="form__label" htmlFor="create-role">Rol</label>
            <select className="form__input" id="create-role" required value={form.roleLevel} onChange={set('roleLevel')}>
              <option value="">Seleccione un rol</option>
              <RoleOptions />
            </select>
          </div>
          <div className="form__group">
            <label className="form__label" htmlFor="create-territory">Territorio</label>
            <input className="form__input" type="text" id="create-territory" placeholder="Opcional" value={form.territory} onChange={set('territory')} />
          </div>
          <div className="form__group">
            <label className="form__label" htmlFor="create-gender">Género</label>
            <GenderSelect id="create-gender" value={form.gender} onChange={set('gender')} />
          </div>
        </div>
        <div className="user-form-actions">
          <button className="btn btn--primary" type="submit" id="create-user-btn" disabled={busy}>Crear Usuario</button>
          <button className="btn btn--outline" type="button" onClick={() => { reset(); onCancel(); }}>Cancelar</button>
        </div>
      </form>
    </div>
  );
}

function RoleOptions() {
  const { roleOptions } = useMeta();
  return roleOptions().map((o) => <option key={o.value} value={o.value}>{o.label}</option>);
}

function EditUserPanel({ open, user, onCancel, onSaved }) {
  const [form, setForm] = useState({ email: '', fullName: '', roleLevel: '', territory: '', gender: '' });
  const [feedback, setFeedback] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!user) return;
    setForm({
      email: user.email || '',
      fullName: user.full_name || '',
      roleLevel: String(user.role_level),
      territory: user.territory || '',
      gender: user.gender || '',
    });
    setFeedback(null);
  }, [user]);

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setFeedback(null);
    try {
      await API.updateUser(user.id, {
        email: form.email.trim(),
        full_name: form.fullName.trim(),
        role_level: parseInt(form.roleLevel, 10),
        territory: form.territory.trim() || null,
        gender: form.gender || null,
      });
      setFeedback({ type: 'success', message: 'Usuario actualizado exitosamente' });
      setTimeout(() => onSaved(), 1000);
    } catch (err) {
      setFeedback({ type: 'error', message: err.message || 'Error al actualizar el usuario' });
      setBusy(false);
    }
  };

  if (!user) return <div className="user-form-panel hidden" id="edit-user-panel" />;

  return (
    <div className={`user-form-panel${open ? '' : ' hidden'}`} id="edit-user-panel">
      <h3 className="user-form-panel__title">Editar Usuario</h3>
      <div id="edit-user-feedback"><Alert {...(feedback || {})} /></div>
      <form id="edit-user-form" onSubmit={handleSubmit}>
        <input type="hidden" id="edit-user-id" value={user.id} readOnly />
        <div className="user-form-grid">
          <div className="form__group">
            <label className="form__label" htmlFor="edit-username">Usuario</label>
            <input className="form__input" type="text" id="edit-username" disabled value={user.username} readOnly />
          </div>
          <div className="form__group">
            <label className="form__label" htmlFor="edit-email">Email</label>
            <input className="form__input" type="email" id="edit-email" required placeholder="correo@ejemplo.com" value={form.email} onChange={set('email')} />
          </div>
          <div className="form__group">
            <label className="form__label" htmlFor="edit-fullname">Nombre Completo</label>
            <input className="form__input" type="text" id="edit-fullname" required minLength={2} placeholder="Nombre completo" value={form.fullName} onChange={set('fullName')} />
          </div>
          <div className="form__group">
            <label className="form__label" htmlFor="edit-role">Rol</label>
            <select className="form__input" id="edit-role" required value={form.roleLevel} onChange={set('roleLevel')}>
              <RoleOptions />
            </select>
          </div>
          <div className="form__group">
            <label className="form__label" htmlFor="edit-territory">Territorio</label>
            <input className="form__input" type="text" id="edit-territory" placeholder="Opcional" value={form.territory} onChange={set('territory')} />
          </div>
          <div className="form__group">
            <label className="form__label" htmlFor="edit-gender">Género</label>
            <GenderSelect id="edit-gender" value={form.gender} onChange={set('gender')} />
          </div>
        </div>
        <div className="user-form-actions">
          <button className="btn btn--primary" type="submit" id="edit-user-btn" disabled={busy}>Guardar Cambios</button>
          <button className="btn btn--outline" type="button" onClick={onCancel}>Cancelar</button>
        </div>
      </form>
    </div>
  );
}

function ResetPasswordPanel({ open, target, onCancel, onDone }) {
  const [password, setPassword] = useState('');
  const [feedback, setFeedback] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setPassword('');
    setFeedback(null);
  }, [target]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!password || password.length < 8) {
      setFeedback({ type: 'error', message: 'La contraseña debe tener al menos 8 caracteres' });
      return;
    }
    setBusy(true);
    setFeedback(null);
    try {
      await API.resetUserPassword(target.id, password);
      setFeedback({ type: 'success', message: 'Contraseña restablecida exitosamente' });
      setTimeout(() => onDone(), 1500);
    } catch (err) {
      setFeedback({ type: 'error', message: err.message || 'Error al restablecer la contraseña' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={`user-form-panel${open ? '' : ' hidden'}`} id="reset-password-panel">
      <h3 className="user-form-panel__title">Restablecer Contraseña</h3>
      <p className="user-form-panel__subtitle" id="reset-password-username">{target ? `Usuario: ${target.username}` : ''}</p>
      <div id="reset-password-feedback"><Alert {...(feedback || {})} /></div>
      <form id="reset-password-form" onSubmit={handleSubmit}>
        <div className="form__group">
          <label className="form__label" htmlFor="reset-password-input">Nueva Contraseña</label>
          <input className="form__input" type="password" id="reset-password-input" required minLength={8} placeholder="Mínimo 8 caracteres" value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        <div className="user-form-actions">
          <button className="btn btn--primary" type="submit" id="reset-password-btn" disabled={busy}>Restablecer</button>
          <button className="btn btn--outline" type="button" onClick={onCancel}>Cancelar</button>
        </div>
      </form>
    </div>
  );
}

export default function Users() {
  usePageTitle('Gestión de Usuarios');
  const { user: currentUser } = useAuth();
  const { roleName, roleOptions } = useMeta();
  const { showToast } = useToast();
  const confirm = useConfirm();
  const navigate = useNavigate();

  const [users, setUsers] = useState(null);
  const [panel, setPanel] = useState(null); // 'create' | 'edit' | 'reset' | null
  const [editTarget, setEditTarget] = useState(null);
  const [resetTarget, setResetTarget] = useState(null);
  const editPanelRef = useRef(null);
  const resetPanelRef = useRef(null);

  const authorized = Boolean(currentUser && currentUser.role_level === 3);
  const load = () => API.getUsers().then((result) => setUsers(result.data.users || []));

  useEffect(() => {
    if (!authorized) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authorized]);

  useEffect(() => {
    if (authorized) return;
    const timer = setTimeout(() => navigate('/dashboard'), 2000);
    return () => clearTimeout(timer);
  }, [authorized, navigate]);

  useEffect(() => {
    if (panel === 'edit' && editPanelRef.current) editPanelRef.current.scrollIntoView({ behavior: 'smooth' });
    if (panel === 'reset' && resetPanelRef.current) resetPanelRef.current.scrollIntoView({ behavior: 'smooth' });
  }, [panel]);

  if (!authorized) {
    return <div className="alert alert--error">No tiene permisos para acceder a la gestión de usuarios.</div>;
  }

  if (!users) return <Loading />;

  const handleToggleActive = async (u) => {
    const action = u.is_active ? 'desactivar' : 'activar';
    if (!(await confirm(`¿Está seguro de ${action} al usuario "${u.username}"?`))) return;

    // Optimistic update: flip the row immediately, roll back only if the request fails —
    // no full-table reload, no wait for the round-trip.
    setUsers((list) => list.map((row) => (row.id === u.id ? { ...row, is_active: u.is_active ? 0 : 1 } : row)));
    try {
      await API.toggleUserActive(u.id);
    } catch (err) {
      setUsers((list) => list.map((row) => (row.id === u.id ? { ...row, is_active: u.is_active } : row)));
      showToast(err.message || `Error al ${action} el usuario`, 'error');
    }
  };

  return (
    <>
      <div className="main__header">
        <h2 className="main__title">Gestión de Usuarios</h2>
        <button className="btn btn--primary" onClick={() => setPanel('create')}>+ Crear Usuario</button>
      </div>

      <CreateUserPanel open={panel === 'create'} onCancel={() => setPanel(null)} onCreated={() => { setPanel(null); load(); }} />
      <div ref={editPanelRef}>
        <EditUserPanel open={panel === 'edit'} user={editTarget} onCancel={() => setPanel(null)} onSaved={() => { setPanel(null); load(); }} />
      </div>
      <div ref={resetPanelRef}>
        <ResetPasswordPanel open={panel === 'reset'} target={resetTarget} onCancel={() => setPanel(null)} onDone={() => setPanel(null)} />
      </div>

      <FilterableTable
        filtersId="user-filters"
        tableId="user-table-container"
        rows={users}
        emptyText="No se encontraron usuarios"
        filters={{
          search: {
            id: 'user-search',
            placeholder: '🔍 Buscar usuario...',
            label: 'Buscar usuario',
            fields: (u) => [u.full_name, u.username, u.email],
          },
          selects: [
            {
              id: 'user-filter-role',
              label: 'Filtrar por rol',
              allLabel: 'Rol: Todos',
              options: roleOptions(),
              matches: (u, value) => u.role_level === parseInt(value, 10),
            },
            {
              id: 'user-filter-status',
              label: 'Filtrar por estado',
              allLabel: 'Estado: Todos',
              options: [{ value: '1', label: 'Activo' }, { value: '0', label: 'Inactivo' }],
              matches: (u, value) => String(u.is_active) === value,
            },
          ],
        }}
        columns={[
          { header: 'Nombre', render: (u) => u.full_name },
          { header: 'Usuario', render: (u) => u.username },
          { header: 'Email', render: (u) => u.email || '—' },
          { header: 'Rol', render: (u) => roleName(u.role_level, u.gender) },
          { header: 'Territorio', render: (u) => u.territory || '—' },
          {
            header: 'Estado',
            render: (u) => <span className={`badge ${u.is_active ? 'badge--user-active' : 'badge--user-inactive'}`}>{u.is_active ? 'Activo' : 'Inactivo'}</span>,
          },
          {
            header: 'Acciones',
            render: (u) => (
              <div className="user-actions">
                <button className="btn btn--outline btn--sm" aria-label={`Editar ${u.username}`} onClick={() => { setEditTarget(u); setPanel('edit'); }}>✏️ Editar</button>
                <button className="btn btn--outline btn--sm" aria-label={`Restablecer contraseña de ${u.username}`} onClick={() => { setResetTarget(u); setPanel('reset'); }}>🔑 Contraseña</button>
                <button
                  className={`btn btn--sm btn--outline ${u.is_active ? 'btn--warning-outline' : 'btn--success-outline'}`}
                  data-action="toggle-user-active"
                  aria-label={`${u.is_active ? 'Desactivar' : 'Activar'} ${u.username}`}
                  onClick={() => handleToggleActive(u)}
                >
                  {u.is_active ? 'Desactivar' : 'Activar'}
                </button>
              </div>
            ),
          },
        ]}
      />
    </>
  );
}
