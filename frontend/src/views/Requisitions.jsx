/* ============================================
   CID Aprueba — Requisitions list view
   ============================================ */
import { useEffect, useRef, useState } from 'react';
import Loading from '../components/Loading.jsx';
import { useNavigate } from 'react-router-dom';
import * as API from '../api.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useMeta } from '../context/MetaContext.jsx';
import { usePageTitle } from '../context/PageTitleContext.jsx';
import { formatDateShort } from '../utils/format.js';
import StatusBadge from '../components/StatusBadge.jsx';
import FilterableTable from '../components/FilterableTable.jsx';

/** Progress bar for a requisition (status + current step). */
export function ReqProgressBar({ req }) {
  const { maxStep, statusLabel } = useMeta();
  const totalSteps = maxStep();
  const level = req.current_approval_level || 1;
  let percent = ((level - 1) / totalSteps) * 100;
  let fillClass = '';
  let labelClass = '';
  let labelText = `Paso ${level} de ${totalSteps}`;

  if (req.status === 'approved') {
    percent = 100;
    fillClass = 'req-progress__fill--approved';
    labelClass = 'req-progress__label--approved';
    labelText = statusLabel('approved');
  } else if (req.status === 'rejected') {
    if (percent < 5) percent = 5;
    fillClass = 'req-progress__fill--rejected';
    labelClass = 'req-progress__label--rejected';
    labelText = `${statusLabel('rejected')} — Paso ${level} de ${totalSteps}`;
  } else if (req.status === 'returned') {
    if (percent < 5) percent = 5;
    fillClass = 'req-progress__fill--returned';
    labelClass = 'req-progress__label--returned';
    labelText = `${statusLabel('returned')} — Paso ${level} de ${totalSteps}`;
  }

  const fillRef = useRef(null);
  useEffect(() => {
    requestAnimationFrame(() => {
      if (fillRef.current) fillRef.current.style.width = `${percent}%`;
    });
  }, [percent]);

  return (
    <div className="req-progress">
      <div className="req-progress__bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow={Math.round(percent)} aria-label={labelText}>
        <div className={`req-progress__fill ${fillClass}`} ref={fillRef} style={{ width: 0 }} />
      </div>
      <span className={`req-progress__label ${labelClass}`}>{labelText}</span>
    </div>
  );
}

function projectOptionsFrom(requisitions) {
  const seen = new Map();
  for (const req of requisitions) {
    if (req.project_id && !seen.has(req.project_id)) seen.set(req.project_id, req.project_name);
  }
  return [...seen.entries()]
    .sort((a, b) => a[1].localeCompare(b[1]))
    .map(([id, name]) => ({ value: String(id), label: name }));
}

export default function Requisitions() {
  usePageTitle('Requisiciones');
  const { user } = useAuth();
  const { statusOptions, stepOptions } = useMeta();
  const navigate = useNavigate();
  const [requisitions, setRequisitions] = useState(null);
  const [filteredIds, setFilteredIds] = useState([]);
  const [csvBusy, setCsvBusy] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    API.getAllRequisitions().then((result) => {
      if (!cancelled) setRequisitions(result.data.items || []);
    });
    return () => { cancelled = true; };
  }, []);

  if (!requisitions) return <Loading />;

  const exportAs = async (which) => {
    const setBusy = which === 'csv' ? setCsvBusy : setPdfBusy;
    const fn = which === 'csv' ? API.exportRequisitionsCsv : API.exportRequisitionsPdf;
    setBusy(true);
    try {
      await fn(filteredIds);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="main__header">
        <h2 className="main__title">Requisiciones</h2>
        {user && user.role_level === 1 && (
          <button className="btn btn--primary" onClick={() => navigate('/create')}>Crear Requisición</button>
        )}
      </div>

      <FilterableTable
        filtersId="req-filters"
        tableId="req-table-container"
        rows={requisitions}
        emptyText="No se encontraron requisiciones"
        onFilterChange={(rows) => setFilteredIds(rows.map((r) => r.id))}
        filters={{
          search: {
            id: 'req-search',
            placeholder: '🔍 Buscar por número, título o responsable...',
            label: 'Buscar requisición',
            fields: (req) => [req.number, req.title, req.description, req.uploader_name],
          },
          selects: [
            {
              id: 'req-filter-status',
              label: 'Filtrar por estado',
              allLabel: 'Estado: Todos',
              options: statusOptions(),
              matches: (req, value) => req.status === value,
            },
            {
              id: 'req-filter-level',
              label: 'Filtrar por nivel',
              allLabel: 'Nivel: Todos',
              options: stepOptions(),
              matches: (req, value) => req.current_approval_level === parseInt(value, 10),
            },
            {
              id: 'req-filter-project',
              label: 'Filtrar por proyecto',
              allLabel: 'Proyecto: Todos',
              options: projectOptionsFrom(requisitions),
              matches: (req, value) => String(req.project_id) === value,
            },
          ],
          dateRange: {
            fromId: 'req-filter-from',
            toId: 'req-filter-to',
            fromLabel: 'Desde',
            toLabel: 'Hasta',
            field: (req) => req.created_at,
          },
        }}
        extraFilterContent={(
          <div className="search-filters__export-group">
            <button className="btn btn--outline" id="btn-export-csv" disabled={csvBusy} title="Datos en bruto para Excel" onClick={() => exportAs('csv')}>
              {csvBusy ? 'Exportando...' : 'Exportar CSV'}
            </button>
            <button className="btn btn--secondary" id="btn-export-pdf" disabled={pdfBusy} title="Reporte con el mismo formato del acta" onClick={() => exportAs('pdf')}>
              {pdfBusy ? 'Exportando...' : '📄 Exportar PDF'}
            </button>
          </div>
        )}
        columns={[
          {
            header: 'Número',
            render: (req) => (
              <>
                <span className="req-number">{req.number || `#${req.id}`}</span>
                {req.version > 1 && <span className="version-badge">v{req.version}</span>}
              </>
            ),
          },
          { header: 'Título', render: (req) => req.title },
          { header: 'Proyecto', render: (req) => (req.project_name ? req.project_name : <span style={{ color: 'var(--color-text-light)' }}>—</span>) },
          { header: 'Estado', render: (req) => <StatusBadge status={req.status} /> },
          { header: 'Progreso', render: (req) => <ReqProgressBar req={req} /> },
          { header: 'Radicada por', render: (req) => req.uploader_name },
          { header: 'Fecha', render: (req) => <span className="nowrap">{formatDateShort(req.created_at)}</span> },
        ]}
        rowProps={(req) => ({
          className: 'table__row--clickable',
          role: 'button',
          tabIndex: 0,
          'aria-label': `Ver requisición ${req.number || ''} ${req.title}`,
          onClick: () => navigate(`/requisitions/${req.id}`),
          onKeyDown: (e) => (e.key === 'Enter' || e.key === ' ') && navigate(`/requisitions/${req.id}`),
        })}
      />
    </>
  );
}
