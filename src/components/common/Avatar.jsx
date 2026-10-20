export default function Avatar({ creator, size = 36 }) {
  const initials = (creator?.name ?? '?').split(' ').map((w) => w[0]).slice(0, 2).join('');
  return (
    <span className="avatar" style={{ width: size, height: size, background: creator?.color ?? '#6a645a', fontSize: size * 0.38 }} aria-hidden="true">
      {creator?.avatarUrl ? <img src={creator.avatarUrl} alt="" /> : initials}
    </span>
  );
}
