import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Sprout } from 'lucide-react';
import PostGrid from '../posts/PostGrid.jsx';
import EmptyState from '../common/EmptyState.jsx';
import { usePosts } from '../../hooks/usePosts.js';

export default function InspiredWorks({ post }) {
  const { getInspiredWorks } = usePosts();
  const [works, setWorks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    getInspiredWorks(post.id)
      .then((result) => { if (!cancelled) setWorks(result); })
      .catch((requestError) => { if (!cancelled) setError(requestError.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [post.id, getInspiredWorks]);

  return (
    <section className="section" aria-labelledby="inspired-heading">
      <h2 id="inspired-heading">Inspired works {works.length > 0 && <span className="count">{works.length}</span>}</h2>
      {loading && <p aria-busy="true">Loading attributed works…</p>}
      {error && <p className="field__error" role="alert">{error}</p>}
      {!loading && !error && works.length ? <PostGrid posts={works} /> : !loading && !error ? (
        <EmptyState icon={Sprout} title="Nothing grown from this yet" action={<Link className="btn btn--ghost" to={`/create?source=${post.id}`}>Be the first to respond</Link>}>
          When someone makes something in response to this work, it appears here with credit attached.
        </EmptyState>
      ) : null}
    </section>
  );
}
