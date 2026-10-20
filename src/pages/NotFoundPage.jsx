import { Link } from 'react-router-dom';
import { Compass } from 'lucide-react';
import EmptyState from '../components/common/EmptyState.jsx';

export default function NotFoundPage() {
  return <EmptyState icon={Compass} title="This page doesn’t exist" action={<Link className="btn btn--primary" to="/">Back to Home</Link>}>The link may be old, or mistyped.</EmptyState>;
}
