import { ShieldCheck, Hourglass, PenLine, GitBranch, CircleHelp } from 'lucide-react';
import { AUTHENTICITY_STATUSES, getAuthenticityStatus } from '../../utils/attribution.js';

const ICONS = { verified: ShieldCheck, pending: Hourglass, declared_original: PenLine, declared_inspired: GitBranch, unverified: CircleHelp };

export default function AuthenticityBadge({ post, showDescription = false }) {
  const key = getAuthenticityStatus(post);
  const { label, tone, description } = AUTHENTICITY_STATUSES[key];
  const Icon = ICONS[key];
  return (
    <div className="authenticity">
      <span className={`badge badge--${tone}`} title={description}>
        <Icon size={14} aria-hidden="true" />{label}
      </span>
      {showDescription && <p className="authenticity__text">{description}</p>}
    </div>
  );
}
