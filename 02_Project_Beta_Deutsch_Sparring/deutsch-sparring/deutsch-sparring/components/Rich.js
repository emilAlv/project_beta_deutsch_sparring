// Tiny formatter for tutor text: **bold** and *italic*, nothing else. Builds React elements
// (no innerHTML), so text from the model can never inject HTML.

export default function Rich({ text }) {
  const out = [];
  const re = /\*\*(.+?)\*\*|\*([^*\n]+)\*/g;
  let last = 0;
  let m;
  let k = 0;
  const s = String(text || '');
  while ((m = re.exec(s))) {
    if (m.index > last) out.push(s.slice(last, m.index));
    out.push(m[1] ? <strong key={k++}>{m[1]}</strong> : <em key={k++}>{m[2]}</em>);
    last = m.index + m[0].length;
  }
  if (last < s.length) out.push(s.slice(last));
  return <>{out}</>;
}

// Segments from lib/diff.js → text with the marked parts wrapped in <Tag className=…>.
export function Marked({ segments, as: Tag = 'mark', className }) {
  return (
    <>
      {segments.map((seg, i) => (seg.marked ? <Tag key={i} className={className}>{seg.text}</Tag> : <span key={i}>{seg.text}</span>))}
    </>
  );
}
