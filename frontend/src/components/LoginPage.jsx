import { useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';

export default function LoginPage({ onLoginSuccess }) {
  const { login } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const u = username.trim();
    if (!u || !password) {
      setError('Ingrese usuario y contraseña');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const result = await login(u, password);
      onLoginSuccess(result.data.user);
    } catch (err) {
      setError(err.message || 'Error al iniciar sesión');
      setBusy(false);
    }
  };

  return (
    <div id="login-view" className="login">
      <div className="login__card">
        <div className="login__brand">
          <img src="/assets/logo-LA-CID.svg" alt="CID - Corporación Infancia y Desarrollo" className="login__logo-img" />
        </div>
        <div id="login-error" className={`login__error${error ? '' : ' hidden'}`}>{error}</div>
        <form id="login-form" autoComplete="off" onSubmit={handleSubmit}>
          <div className="form__group">
            <label className="form__label" htmlFor="login-username">Usuario</label>
            <input
              className="form__input"
              type="text"
              id="login-username"
              name="username"
              required
              autoComplete="username"
              placeholder="Ingrese su usuario"
              autoFocus
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
          </div>
          <div className="form__group">
            <label className="form__label" htmlFor="login-password">Contraseña</label>
            <input
              className="form__input"
              type="password"
              id="login-password"
              name="password"
              required
              autoComplete="current-password"
              placeholder="Ingrese su contraseña"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <button className="btn btn--primary btn--block" type="submit" id="login-btn" disabled={busy}>
            {busy ? 'Ingresando...' : 'Ingresar'}
          </button>
        </form>
      </div>
    </div>
  );
}
