import { CATEGORIES } from '../../data/categories.js';

export default function CategoryFilter({ value, onChange }) {
  const options = [{ id: 'all', label: 'All' }, ...CATEGORIES];
  return (
    <div className="category-filter" role="group" aria-label="Filter by category">
      {options.map((o) => (
        <button key={o.id} type="button" className="chip chip--button" aria-pressed={value === o.id} onClick={() => onChange(o.id)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}
