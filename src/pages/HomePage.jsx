import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Plus } from "lucide-react";
import Avatar from "../components/common/Avatar.jsx";
import FeedPost from "../components/posts/FeedPost.jsx";
import { usePosts } from "../hooks/usePosts.js";
import { CATEGORIES } from "../data/categories.js";
import { filterPosts, SORT_OPTIONS } from "../utils/filters.js";
import { useAuth } from "../context/AuthContext.jsx";
import "../styles/layout.css";
import "../styles/LandingPage.css";
import "../styles/HomeFeed.css";

/* Hero decoration only. Real posts come from the shared PostContext. */
const ARC_CARDS = [
  { id: "old-quarter", title: "Old Quarter", blurb: "Streets narrow enough that the buildings touch hands.", image: "https://res.cloudinary.com/q8wj5lcc/image/upload/v1787472660/samples/people/jazz.jpg" },
  { id: "clay-kiln", title: "Clay & Kiln", blurb: "Wheel-thrown bowls, fired until they hum.", image: "https://res.cloudinary.com/q8wj5lcc/image/upload/v1787472657/samples/food/dessert.jpg" },
  { id: "night-studio", title: "Night Studio", blurb: "Painters who only start after midnight.", image: "https://res.cloudinary.com/q8wj5lcc/image/upload/v1792508309/WhatsApp_Image_2026-10-20_at_8.27.17_PM.jpg" },
  { id: "salt-marsh", title: "Salt Marsh", blurb: "Photographs made at low tide, before the light turns.", image: "https://res.cloudinary.com/q8wj5lcc/image/upload/v1792508308/WhatsApp_Image_2026-10-20_at_8.27.16_PM_3.jpg" },
  { id: "loom-room", title: "Loom Room", blurb: "Handwoven cloth, thread by patient thread.", image: "https://res.cloudinary.com/q8wj5lcc/image/upload/v1792508307/WhatsApp_Image_2026-10-20_at_8.27.17_PM_2.jpg" },
  { id: "rooftop-sessions", title: "Rooftop Sessions", blurb: "Live music recorded above the city noise.", image: "https://res.cloudinary.com/q8wj5lcc/image/upload/v1792508307/WhatsApp_Image_2026-10-20_at_8.27.16_PM.jpg" },
  { id: "ink-garden", title: "Ink Garden", blurb: "Poems pressed between pages and pressed flowers.", image: "https://res.cloudinary.com/q8wj5lcc/image/upload/v1792508307/WhatsApp_Image_2026-10-20_at_8.27.16_PM_2.jpg" },
  { id: "stillwater", title: "Stillwater", blurb: "Slow movement studies by the river.", image: "https://res.cloudinary.com/q8wj5lcc/image/upload/v1792508308/WhatsApp_Image_2026-10-20_at_8.27.17_PM_1.jpg" },
  { id: "pigment-lab", title: "Pigment Lab", blurb: "Colours ground by hand from stones and soil.", image: "https://res.cloudinary.com/q8wj5lcc/image/upload/v1792508306/WhatsApp_Image_2026-10-20_at_8.27.16_PM_1.jpg" },
  { id: "glass-hour", title: "Glass Hour", blurb: "Blown glass, shaped in the last minute before it sets.", image: "https://res.cloudinary.com/q8wj5lcc/image/upload/v1792508565/WhatsApp_Image_2026-10-20_at_8.32.14_PM.jpg" },
  { id: "dance-hall", title: "Dance Hall", blurb: "Choreography built from everyday gestures.", image: "https://res.cloudinary.com/q8wj5lcc/image/upload/v1792508565/WhatsApp_Image_2026-10-20_at_8.32.13_PM.jpg" },
  { id: "sketchbook-club", title: "Sketchbook Club", blurb: "Pages that were never meant to be finished.", image: "https://res.cloudinary.com/q8wj5lcc/image/upload/v1792508564/WhatsApp_Image_2026-10-20_at_8.32.13_PM_1.jpg" },
];

/* ---------------- Hero + rotating arc carousel (unchanged) ---------------- */

const ARC_STEP = 360 / ARC_CARDS.length;
const SPIN_SPEED = 7;
const FADE_START = 62;
const FADE_END = 100;

const wrap180 = (deg) => ((((deg + 180) % 360) + 360) % 360) - 180;
const clamp01 = (n) => Math.min(1, Math.max(0, n));

function ArcCarousel({ onCurrentChange }) {
  const itemRefs = useRef([]);
  const spin = useRef(0);
  const paused = useRef(false);
  const currentRef = useRef(0);

  useEffect(() => {
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let frame;
    let last = performance.now();

    const render = () => {
      let nearest = 0;
      let nearestDist = Infinity;

      ARC_CARDS.forEach((_, i) => {
        const el = itemRefs.current[i];
        if (!el) return;

        const angle = wrap180(i * ARC_STEP + spin.current);
        const dist = Math.abs(angle);
        const focus = clamp01(1 - dist / ARC_STEP);
        const visibility = 1 - clamp01((dist - FADE_START) / (FADE_END - FADE_START));

        el.style.transform = `rotate(${angle}deg) translateY(calc(var(--arc-radius) * -1)) scale(${1 + focus * 0.3})`;
        el.style.opacity = visibility;
        el.style.pointerEvents = visibility > 0.3 ? "auto" : "none";
        el.style.zIndex = Math.round(focus * 10);

        if (dist < nearestDist) {
          nearestDist = dist;
          nearest = i;
        }
      });

      if (nearest !== currentRef.current) {
        currentRef.current = nearest;
        onCurrentChange(nearest);
      }
    };

    const tick = (now) => {
      const dt = (now - last) / 1000;
      last = now;
      if (!paused.current) spin.current = (spin.current + SPIN_SPEED * dt) % 360;
      render();
      frame = requestAnimationFrame(tick);
    };

    render();
    if (!reduceMotion) frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [onCurrentChange]);

  const pause = () => { paused.current = true; };
  const resume = () => { paused.current = false; };

  return (
    <ul className="arc" aria-label="Featured creative worlds">
      {ARC_CARDS.map((card, i) => (
        <li key={card.id} className="arc__item" ref={(el) => (itemRefs.current[i] = el)}>
          <Link
            to="/explore"
            className="arc__card"
            style={card.image ? { backgroundImage: `url(${card.image})` } : undefined}
            aria-label={card.title}
            onPointerEnter={pause}
            onPointerLeave={resume}
            onFocus={pause}
            onBlur={resume}
          />
        </li>
      ))}
    </ul>
  );
}

function Hero() {
  const [current, setCurrent] = useState(0);
  const { title, blurb } = ARC_CARDS[current];

  return (
    <header className="hero">
      <ArcCarousel onCurrentChange={setCurrent} />
      <div className="hero__center">
        <h1 className="hero__title">
          <span className="hero__script">Origin</span>
          <span className="hero__display">Creative</span>
        </h1>
        <p className="hero__name" aria-live="off">{title}</p>
        <p className="hero__blurb">{blurb}</p>
        <Link to="/explore" className="hero__details">Details</Link>
      </div>
    </header>
  );
}

/* ---------------- Feed (real shared data) ---------------- */

function StoryRail() {
  const { creators } = usePosts();
  const { user } = useAuth();
  const currentId = user?.id;
  const others = creators.filter((c) => c.id !== currentId).slice(0, 6);

  return (
    <ul className="stories" aria-label="Creators">
      <li className="stories__item">
        <Link to="/create" className="stories__btn">
          <span className="stories__ring">
            <span className="stories__photo" style={{ background: "#c9b79c" }} />
            <span className="stories__add"><Plus size={12} aria-hidden="true" /></span>
          </span>
          <span className="stories__name">Your story</span>
        </Link>
      </li>
      {others.map((c) => (
        <li key={c.id} className="stories__item">
          <Link to={`/profile/${c.username ?? c.id}`} className="stories__btn">
            <span className="stories__ring">
              <span className="stories__photo"><Avatar creator={c} size={58} /></span>
            </span>
            <span className="stories__name">{c.name.split(" ")[0]}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function CategoryChips({ value, onChange }) {
  const options = [{ id: "all", label: "For you" }, ...CATEGORIES];
  return (
    <div className="chips" role="group" aria-label="Filter by discipline">
      {options.map((c) => (
        <button
          key={c.id}
          type="button"
          aria-pressed={value === c.id}
          className={`chip${value === c.id ? " is-active" : ""}`}
          onClick={() => onChange(c.id)}
        >
          {c.label}
        </button>
      ))}
    </div>
  );
}

function Feed() {
  const {
    status, posts, creatorsById, commentCounts, pagination,
    loadingMore, loadMoreError, loadMorePosts,
  } = usePosts();
  const [category, setCategory] = useState("all");
  const [sort, setSort] = useState("newest");

  const results = useMemo(
    () => filterPosts(posts, { query: "", category, sort }, { creatorsById, commentCounts }),
    [posts, category, sort, creatorsById, commentCounts],
  );

  return (
    <section className="feed">
      <div className="feed__column">
        <div className="feed__intro">
          <div>
            <p className="eyebrow">Your creative circle</p>
            <h2 className="feed__title">Art has a story.</h2>
            <p className="feed__lede">Discover the work, meet the maker, trace the spark.</p>
          </div>
          <Link to="/explore" className="feed__explore">Explore all →</Link>
        </div>

        <StoryRail />
        <CategoryChips value={category} onChange={setCategory} />

        <div className="feed__bar">
          <div>
            <p className="eyebrow">Fresh from the community</p>
            <h2 className="feed__subtitle">Made with meaning</h2>
          </div>
          <label className="feed__sort">
            <span className="sr-only">Sort posts</span>
            <select value={sort} onChange={(e) => setSort(e.target.value)}>
              {SORT_OPTIONS.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
            </select>
          </label>
        </div>

        {status === "loading" && (
          <>
            <div className="fpost-skeleton" aria-hidden="true" />
            <div className="fpost-skeleton" aria-hidden="true" />
          </>
        )}
        {status === "ready" && results.map((post) => <FeedPost key={post.feedEntryId ?? post.id} post={post} />)}
        {status === "ready" && !results.length && (
          <p className="feed__empty">No posts here yet. <Link to="/create">Be the first to share one.</Link></p>
        )}
        {status === "ready" && pagination && pagination.page < pagination.totalPages && (
          <div className="feed__pagination">
            {loadMoreError && <p className="notice notice--error" role="alert">{loadMoreError}</p>}
            <button className="outline-btn" type="button" onClick={() => { void loadMorePosts(); }} disabled={loadingMore}>
              {loadingMore ? 'Loading more…' : 'Load more works'}
            </button>
          </div>
        )}
      </div>
    </section>
  );
}

export default function HomePage() {
  return (
    <div className="home">
      <Hero />
      <Feed />
    </div>
  );
}