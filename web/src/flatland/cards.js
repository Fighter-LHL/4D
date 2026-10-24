// Small authored vector diagrams; the actual observed sections come from the model.
const svg = body => `<svg viewBox="0 0 120 64" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round">${body}</svg>`;
const circle = (cx, r) => `<circle cx="${cx}" cy="32" r="${r}"/>`;
const square = cx => `<rect x="${cx - 10}" y="22" width="20" height="20"/>`;
const arrow = '<path d="M35 32h9m-4-4 4 4-4 4M70 32h9m-4-4 4 4-4 4"/>';
const box = '<path d="m37 20 28-10 23 14-28 10zM37 20v28l23 13 28-11V24M60 34v27"/>';

export function illustration(kind) {
  const drawings = {
    sphere: `${circle(60, 23)}<ellipse cx="60" cy="32" rx="23" ry="8" stroke-dasharray="3 3"/>`,
    cube: box,
    cone: '<path d="M34 50 60 8l26 42"/><ellipse cx="60" cy="50" rx="26" ry="7"/>',
    cylinder: '<ellipse cx="33" cy="32" rx="9" ry="20"/><path d="M33 12h54m-54 40h54m0-40c12 0 12 40 0 40"/>',
    'diagonal-cube': '<path d="m60 5 25 14v27L60 60 35 46V19zM60 5v27m0 0 25 14M60 32 35 46"/><path d="m35 19 25 14 25-14M60 33v27" stroke-dasharray="3 3"/>',
    square: '<rect x="40" y="12" width="40" height="40"/>',
    hexagon: '<path d="m38 32 11-19h22l11 19-11 19H49z"/>',
    circle: circle(60, 21),
    triangle: '<path d="m60 10 25 43H35z"/>',
    growing: `${circle(20, 3)}${circle(55, 10)}${circle(93, 19)}${arrow}`,
    shrinking: `${circle(20, 17)}${circle(55, 10)}${circle(93, 3)}${arrow}`,
    constant: `${circle(20, 11)}${circle(55, 11)}${circle(93, 11)}${arrow}`,
    squares: `${square(20)}${square(55)}${square(93)}${arrow}`,
  };
  return svg(drawings[kind] || '');
}

export function sectionThumbnail(shape) {
  if (!shape) return '<span class="empty-section" aria-hidden="true">∅</span>';
  const body = shape.type === 'circle' ? `<circle cx="${shape.cx}" cy="${shape.cy}" r="${shape.r}"/>`
    : `<polygon points="${shape.points.map(point => point.join(',')).join(' ')}"/>`;
  return `<svg viewBox="6 2 8 8" aria-hidden="true" fill="#cfe6ee" stroke="currentColor" stroke-width=".12">${body}</svg>`;
}

export function sectionDescription(shape) {
  return !shape ? '无截面' : shape.type === 'circle' ? `圆，半径 ${shape.r.toFixed(2)}` : `${shape.points.length} 边形`;
}

export function keyThumbnail(points, label = '') {
  return `<svg viewBox="-1.8 -1.8 3.6 3.6" aria-hidden="true" fill="#eedcae" stroke="currentColor" stroke-width=".09" stroke-linejoin="round"><polygon points="${points.map(point => point.join(',')).join(' ')}"/></svg>${label ? `<span>${label}</span>` : ''}`;
}
