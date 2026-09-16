/* ============================================
   CID Aprueba — Dashboard view
   ============================================ */
import { useEffect, useMemo, useRef, useState } from 'react';
import DashboardSkeleton from '../components/DashboardSkeleton.jsx';
import * as API from '../api.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useMeta } from '../context/MetaContext.jsx';
import { usePageTitle } from '../context/PageTitleContext.jsx';
import { formatDateShort, formatRelativeTime } from '../utils/format.js';
import { useNavigate, Link } from 'react-router-dom';
import StatusBadge from '../components/StatusBadge.jsx';

const ADMIN_ROLE = 3; // Representante Legal

const STATUS_COLORS = [
  { key: 'pending', color: '#C85A2A' },
  { key: 'in_review', color: '#6B8E23' },
  { key: 'returned', color: '#E6A817' },
  { key: 'approved', color: '#3D5A1E' },
  { key: 'rejected', color: '#B22222' },
];

// --- Animated counter ---

function useAnimatedCounter(target, duration = 1500) {
  const [value, setValue] = useState(0);
  useEffect(() => {
    if (!target) {
      setValue(0);
      return;
    }
    let startTime = null;
    let raf = null;
    const easeOut = (t) => 1 - Math.pow(1 - t, 3);
    const update = (now) => {
      if (startTime === null) startTime = now;
      const progress = Math.min((now - startTime) / duration, 1);
      setValue(Math.round(easeOut(progress) * target));
      if (progress < 1) raf = requestAnimationFrame(update);
    };
    setValue(0);
    raf = requestAnimationFrame(update);
    return () => raf && cancelAnimationFrame(raf);
  }, [target, duration]);
  return value;
}

function StatCard({ variant, label, target }) {
  const value = useAnimatedCounter(target);
  return (
    <div className={`stat-card stat-card--${variant}`}>
      <div className="stat-card__label">{label}</div>
      <div className="stat-card__value stat-counter">{value}</div>
    </div>
  );
}

// --- SVG donut chart ---

function DonutChart({ byStatus }) {
  const { statusLabel } = useMeta();
  const data = STATUS_COLORS.map(({ key, color }) => ({ key, color, label: statusLabel(key), value: byStatus[key] || 0 }));
  const total = data.reduce((sum, d) => sum + d.value, 0);
  const size = 200;
  const cx = size / 2;
  const cy = size / 2;
  const radius = 70;
  const strokeWidth = 28;
  const circumference = 2 * Math.PI * radius;

  let offset = 0;
  const segments = [];
  if (total === 0) {
    segments.push(
      <circle key="empty" cx={cx} cy={cy} r={radius} fill="none" stroke="#E0D8CC" strokeWidth={strokeWidth} />,
    );
  } else {
    data.forEach((d, i) => {
      if (d.value === 0) return;
      const segmentLength = (d.value / total) * circumference;
      const gapLength = circumference - segmentLength;
      const currentOffset = offset;
      offset += segmentLength;
      segments.push(
        <circle
          key={d.key}
          cx={cx}
          cy={cy}
          r={radius}
          fill="none"
          stroke={d.color}
          strokeWidth={strokeWidth}
          strokeDasharray={`${segmentLength} ${gapLength}`}
          strokeDashoffset={-currentOffset}
          strokeLinecap="butt"
          transform={`rotate(-90 ${cx} ${cy})`}
          className="donut-segment"
          style={{ animationDelay: `${(i * 0.15).toFixed(2)}s` }}
        />,
      );
    });
  }

  return (
    <div className="chart-donut">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="donut-svg" role="img" aria-label={`Distribución por estado: ${total} requisiciones`}>
        {segments}
        <text x={cx} y={cy} textAnchor="middle" dominantBaseline="central" className="donut-center-text">
          <tspan x={cx} dy="-6" className="donut-center-number">{total}</tspan>
          <tspan x={cx} dy="18" className="donut-center-label">Total</tspan>
        </text>
      </svg>
      <div className="chart-legend">
        {data.map((d) => (
          <div className="chart-legend__item" key={d.key}>
            <span className="chart-legend__dot" style={{ backgroundColor: d.color }} />
            <span className="chart-legend__label">{d.label}</span>
            <span className="chart-legend__value">{d.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// --- Horizontal bar chart (requisitions per step) ---

function BarChart({ byStep }) {
  const { stepLabel, maxStep } = useMeta();
  // Proportional to the total open requisitions, not to the busiest step —
  // otherwise a single requisition fills its bar to 100% and looks like everything is done.
  const total = Object.values(byStep).reduce((sum, c) => sum + c, 0);
  const rows = [];
  for (let step = 1; step <= maxStep(); step++) {
    const count = byStep[String(step)] || 0;
    const pct = total > 0 ? (count / total) * 100 : 0;
    rows.push({ step, count, pct, isZero: count === 0, label: stepLabel(step) });
  }

  const fillRefs = useRef([]);
  useEffect(() => {
    fillRefs.current.forEach((el, i) => {
      if (!el) return;
      const target = rows[i].pct;
      setTimeout(() => { el.style.width = `${target}%`; }, i * 60);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [byStep]);

  return (
    <div className="chart-bars">
      {rows.map((row, i) => (
        <div className={`bar-row${row.isZero ? ' bar-row--zero' : ''}`} key={row.step}>
          <div className="bar-row__top">
            <span className="bar-label">{row.label}</span>
            <span className={`bar-count${row.isZero ? ' bar-count--zero' : ''}`}>{row.count}</span>
          </div>
          <div className="bar-track">
            <div className="bar-fill" ref={(el) => { fillRefs.current[i] = el; }} style={{ width: '0%' }} />
          </div>
        </div>
      ))}
    </div>
  );
}

// --- Pending list ---

function PendingTag({ requisition }) {
  const { user } = useAuth();
  const { statusLabel } = useMeta();
  if (requisition.status !== 'returned') return null;
  const text = user && user.role_level === 1 ? 'Requiere nueva versión' : statusLabel('returned');
  return <span className="tag tag--warning pending-item__tag">{text}</span>;
}

function PendingItem({ requisition }) {
  const { user } = useAuth();
  const { stepLabel } = useMeta();
  const navigate = useNavigate();
  const needsResubmit = requisition.status === 'returned' && user && user.role_level === 1;
  const buttonLabel = needsResubmit ? 'Radicar nueva versión' : 'Revisar';

  const go = () => {
    if (needsResubmit) navigate(`/requisitions/${requisition.id}`);
    else navigate(`/requisitions/${requisition.id}?focus=approve`);
  };

  return (
    <div className="pending-item" role="button" tabIndex={0} onClick={go} onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && go()} aria-label={`Ver requisición ${requisition.number || ''} ${requisition.title}`}>
      <div className="pending-item__body">
        <div className="pending-item__title">
          {requisition.number && <span className="req-number">{requisition.number} </span>}
          {requisition.title} <PendingTag requisition={requisition} />
        </div>
        <div className="pending-item__meta">
          Radicada por {requisition.uploader_name} — {formatDateShort(requisition.created_at)} — {stepLabel(requisition.current_approval_level)}
        </div>
      </div>
      <div className="pending-item__right">
        <StatusBadge status={requisition.status} />
        <button className="btn btn--primary btn--sm" onClick={(e) => { e.stopPropagation(); go(); }}>{buttonLabel}</button>
      </div>
    </div>
  );
}

// --- Recent activity (grouped by requisition, relative time, collapsed detail) ---

function ActivityItem({ log, compact = false }) {
  const { actionLabel, stepLabel } = useMeta();
  const isReturn = log.action === 'returned';
  return (
    <div className={`activity-item${isReturn ? ' activity-item--returned' : ''}${compact ? ' activity-item--compact' : ''}`}>
      <div className="activity-item__text">
        <strong>{log.user_name}</strong> {actionLabel(log.action)}
        {!compact && log.requisition_number && (
          <>
            {' '}
            <Link to={`/requisitions/${log.requisition_id}`}>
              <span className="req-number">{log.requisition_number}</span> — {log.requisition_title}
            </Link>
          </>
        )}
        {!compact && !log.requisition_number && (
          <> <Link to={`/requisitions/${log.requisition_id}`}>{log.requisition_title}</Link></>
        )}
        {isReturn && log.to_level && (
          <span className="activity-item__target"> → paso {log.to_level} ({stepLabel(log.to_level)})</span>
        )}
        {log.comments && <><br /><em>"{log.comments}"</em></>}
      </div>
      <div className="activity-item__time" title={formatDateShort(log.created_at)}>{formatRelativeTime(log.created_at)}</div>
    </div>
  );
}

function groupActivityByRequisition(logs) {
  const order = [];
  const groups = new Map();
  for (const log of logs) {
    if (!groups.has(log.requisition_id)) {
      groups.set(log.requisition_id, []);
      order.push(log.requisition_id);
    }
    groups.get(log.requisition_id).push(log);
  }
  return order.map((id) => groups.get(id));
}

function ActivityGroup({ group }) {
  const [head, ...rest] = group;
  return (
    <div className="activity-group">
      <ActivityItem log={head} />
      {rest.length > 0 && (
        <details className="activity-group__more">
          <summary>{rest.length} acción{rest.length > 1 ? 'es' : ''} anterior{rest.length > 1 ? 'es' : ''} en esta requisición</summary>
          {rest.map((log) => <ActivityItem key={log.id} log={log} compact />)}
        </details>
      )}
    </div>
  );
}

// --- Render ---

export default function Dashboard() {
  usePageTitle('Panel de Control');
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [pending, setPending] = useState([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.all([API.getDashboardStats(), API.getPending()]).then(([statsResult, pendingResult]) => {
      if (cancelled) return;
      setData(statsResult.data);
      setPending(pendingResult.data.items || []);
    });
    return () => { cancelled = true; };
  }, []);

  const isAdmin = Boolean(user && user.role_level === ADMIN_ROLE);
  const { statusLabel } = useMeta();

  const exportHistory = async () => {
    setBusy(true);
    try {
      await API.exportApprovalsCsv();
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(err);
    } finally {
      setBusy(false);
    }
  };

  const recentActivity = (data && data.recent_activity) || [];
  const groups = useMemo(() => groupActivityByRequisition(recentActivity), [recentActivity]);

  if (!data) return <DashboardSkeleton />;

  const stats = data.summary || {};
  const byStatus = data.by_status || {};
  const byStep = data.by_step || {};
  const openTotal = (stats.pending || 0) + (stats.in_review || 0) + (stats.returned || 0);

  return (
    <>
      <div className="stats">
        <StatCard variant="total" label="Total Requisiciones" target={stats.total || 0} />
        <StatCard variant="pending" label="En proceso" target={openTotal} />
        <StatCard variant="approved" label={`${statusLabel('approved')}s`} target={stats.approved || 0} />
        <StatCard variant="rejected" label={`${statusLabel('rejected')}s`} target={stats.rejected || 0} />
      </div>

      <div className="dashboard-charts">
        <div className="chart-card">
          <h3 className="chart-card__title">Distribución por Estado</h3>
          <DonutChart byStatus={byStatus} />
        </div>
        <div className="chart-card">
          <h3 className="chart-card__title">Requisiciones por Etapa</h3>
          <BarChart byStep={byStep} />
        </div>
      </div>

      <div className="section">
        <h3 className="section__title">Pendientes para ti</h3>
        {pending.length === 0 ? (
          <div className="empty empty--positive">No tienes requisiciones pendientes por revisar</div>
        ) : (
          <div className="pending-list">
            {pending.map((r) => <PendingItem key={r.id} requisition={r} />)}
          </div>
        )}
      </div>

      <div className="section">
        <div className="section__header">
          <h3 className="section__title">Actividad Reciente</h3>
          {isAdmin && (
            <button className="btn btn--outline btn--sm" id="btn-export-approvals" disabled={busy} onClick={exportHistory}>
              {busy ? 'Exportando...' : 'Exportar historial'}
            </button>
          )}
        </div>
        {recentActivity.length === 0 ? (
          <div className="empty empty--neutral">No hay actividad reciente</div>
        ) : (
          <div className="activity-list">
            {groups.map((group) => <ActivityGroup key={group[0].id} group={group} />)}
          </div>
        )}
      </div>
    </>
  );
}
