import { Search } from 'lucide-react';

export default function SearchBar({ value, onChange }) {
  return (
    <div className="search-bar" role="search">
      <Search size={18} aria-hidden="true" />
      <label htmlFor="search-input" className="sr-only">Search by title, creator, tag or category</label>
      <input id="search-input" type="search" value={value} onChange={(e) => onChange(e.target.value)} placeholder="Search titles, creators, tags…" />
    </div>
  );
}
