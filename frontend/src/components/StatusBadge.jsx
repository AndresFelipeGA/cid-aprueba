import { useMeta } from '../context/MetaContext.jsx';

export default function StatusBadge({ status }) {
  const { statusLabel } = useMeta();
  return <span className={`badge badge--${status}`}>{statusLabel(status)}</span>;
}
