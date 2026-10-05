// Simple line illustrations for the role-play scenario card ("Theme / scenario").
// The scene is picked from words in the scenario name; unknown scenarios get two speech bubbles.

const SCENES = [
  { kind: 'move', words: /umzug|umziehen|wohnung|möbel|moebel|zimmer|einzug|haus|wg/i },
  { kind: 'cafe', words: /café|cafe|kaffee|restaurant|bestell|bäckerei|baeckerei|essen|beiz/i },
  { kind: 'shop', words: /einkauf|laden|markt|shop|migros|coop|kleider|kaufen|supermarkt/i },
  { kind: 'travel', words: /bahn|zug|reise|bahnhof|ferien|velo|bus|tram|fahr/i },
  { kind: 'doctor', words: /arzt|ärztin|aerztin|apotheke|praxis|spital|krank|gesund/i },
];

export function sceneKind(scenario) {
  return SCENES.find((s) => s.words.test(scenario || ''))?.kind || 'talk';
}

const props = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.6,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
};

const DRAWINGS = {
  move: (
    <g {...props}>
      <path d="M140 104h168" opacity=".5" />
      {/* boxes */}
      <rect x="150" y="70" width="38" height="34" rx="2" />
      <path d="M150 80h38M169 70v10" />
      <rect x="156" y="42" width="28" height="28" rx="2" />
      <path d="M156 50h28M170 42v8" />
      {/* picture on the wall */}
      <rect x="222" y="18" width="26" height="18" rx="1.5" />
      <path d="m226 32 6-6 5 4 4-3 4 5" />
      {/* sofa */}
      <path d="M206 74v-14a4 4 0 0 1 4-4h52a4 4 0 0 1 4 4v14" />
      <path d="M200 92V78a4 4 0 0 1 8 0v6h56v-6a4 4 0 0 1 8 0v14z" />
      <path d="M206 92v6M266 92v6" />
      {/* floor lamp */}
      <path d="M294 104V44M286 104h16" />
      <path d="M284 44h20l-5-14h-10z" />
    </g>
  ),
  cafe: (
    <g {...props}>
      <path d="M140 102h168" opacity=".5" />
      <ellipse cx="212" cy="96" rx="34" ry="5" />
      <path d="M188 62h46v18c0 9-7 15-15 15h-16c-8 0-15-6-15-15z" />
      <path d="M234 68c9 0 12 4 12 9s-4 9-12 9" />
      <path d="M200 52c-4-5 0-9 0-13s-4-8 0-12M212 52c-4-5 0-9 0-13s-4-8 0-12M224 52c-4-5 0-9 0-13" opacity=".8" />
      <ellipse cx="276" cy="97" rx="22" ry="4" />
      <path d="M258 92c4-12 32-12 36 0-6-3-10-4-18-4s-12 1-18 4z" />
      <path d="M268 86l2 6M276 84v8M284 86l-2 6" opacity=".8" />
    </g>
  ),
  shop: (
    <g {...props}>
      <path d="M140 104h168" opacity=".5" />
      <path d="M196 56h64l-6 48h-52z" />
      <path d="M212 56v-6a16 16 0 0 1 32 0v6" />
      <path d="M210 40c6-14 16-16 22-14" opacity=".8" />
      <path d="M216 38l8-22 8 4-6 20" />
      <circle cx="284" cy="90" r="12" />
      <path d="M284 78c2-4 6-6 9-5" />
      <path d="M160 104V74h22v30M166 74V64h10v10" />
    </g>
  ),
  travel: (
    <g {...props}>
      <path d="M140 108h168M150 116h148" opacity=".5" />
      <rect x="190" y="30" width="76" height="70" rx="12" />
      <path d="M190 64h76" />
      <rect x="200" y="38" width="56" height="20" rx="4" />
      <circle cx="208" cy="82" r="5" />
      <circle cx="248" cy="82" r="5" />
      <path d="m204 100-8 12M252 100l8 12M220 22h16" />
      <path d="M152 92h22l6 14M296 92h-22l-6 14" opacity=".6" />
    </g>
  ),
  doctor: (
    <g {...props}>
      <path d="M140 104h168" opacity=".5" />
      <rect x="196" y="34" width="64" height="64" rx="10" />
      <path d="M228 50v32M212 66h32" strokeWidth="5" />
      <path d="M276 104V64a14 14 0 0 1 28 0v40" opacity=".8" />
      <circle cx="290" cy="50" r="8" opacity=".8" />
      <path d="M162 104c0-14 6-22 12-22s12 8 12 22" opacity=".8" />
    </g>
  ),
  talk: (
    <g {...props}>
      <path d="M180 30h64a10 10 0 0 1 10 10v26a10 10 0 0 1-10 10h-40l-14 12v-12h-10a10 10 0 0 1-10-10V40a10 10 0 0 1 10-10z" />
      <path d="M196 46h36M196 58h22" opacity=".8" />
      <path d="M264 58h26a8 8 0 0 1 8 8v18a8 8 0 0 1-8 8h-4v10l-12-10h-10a8 8 0 0 1-8-8V66a8 8 0 0 1 8-8z" />
      <path d="M268 72h18M268 82h10" opacity=".8" />
    </g>
  ),
};

export default function SceneArt({ scenario }) {
  return (
    <svg className="scene-art" viewBox="0 0 316 126" preserveAspectRatio="xMaxYMid meet" aria-hidden="true" focusable="false">
      {DRAWINGS[sceneKind(scenario)]}
    </svg>
  );
}
