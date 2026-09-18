/** Shown in place of the dashboard while stats/charts are still loading — mirrors the real layout instead of a generic spinner. */
export default function DashboardSkeleton() {
  return (
    <>
      <div className="stats">
        {['total', 'pending', 'approved', 'rejected'].map((variant) => (
          <div className={`stat-card stat-card--${variant}`} key={variant}>
            <div className="skeleton skeleton-stat-card__label" />
            <div className="skeleton skeleton-stat-card__value" />
          </div>
        ))}
      </div>
      <div className="dashboard-charts">
        <div className="chart-card">
          <h3 className="chart-card__title">Distribución por Estado</h3>
          <div className="skeleton" style={{ width: 200, height: 200, borderRadius: '50%', margin: '20px auto' }} />
        </div>
        <div className="chart-card">
          <h3 className="chart-card__title">Requisiciones por Etapa</h3>
          {Array.from({ length: 7 }).map((_, i) => (
            <div className="skeleton skeleton-row" key={i} />
          ))}
        </div>
      </div>
    </>
  );
}
