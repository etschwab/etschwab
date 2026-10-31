// Trims the 3D contribution SVG: drops the language pie (that is on the
// stats card already) and the star and fork counts, keeps the calendar,
// the radar and the contribution count.
// Usage: node scripts/trim-3d.mjs <file.svg>...
//
// The layout is github-profile-3d-contrib v0.9.3: the root holds style, the
// background rect, then <g> for calendar, radar, pie and the footer line.
import { readFileSync, writeFileSync } from "node:fs";

// [start, end) of every direct child element inside the range.
function children(svg, from, to) {
  const tag = /<(\/?)([a-zA-Z][\w:-]*)[^>]*?(\/?)>/g;
  tag.lastIndex = from;
  const out = [];
  let depth = 0;
  let start = -1;
  let m;
  while ((m = tag.exec(svg)) && m.index < to) {
    const [, close, name, self] = m;
    if (close) {
      depth--;
      if (depth === 0) out.push({ name, start, end: tag.lastIndex });
    } else if (self) {
      if (depth === 0) out.push({ name, start: m.index, end: tag.lastIndex });
    } else {
      if (depth === 0) start = m.index;
      depth++;
    }
  }
  return out;
}

const inner = (svg, el) => [svg.indexOf(">", el.start) + 1, svg.lastIndexOf("<", el.end - 1)];

for (const file of process.argv.slice(2)) {
  let svg = readFileSync(file, "utf8");
  const root = children(svg, 0, svg.length)[0];
  const groups = children(svg, ...inner(svg, root)).filter((c) => c.name === "g");
  if (groups.length !== 4) throw new Error(`${file}: expected 4 groups, found ${groups.length}`);
  const [, , pie, footer] = groups;

  // Footer: contribution count and label are the first two texts, the star
  // and fork icons and counts follow. Cut from the third child to the end.
  const footerKids = children(svg, ...inner(svg, footer));
  const cutFrom = footerKids[2].start;
  const cutTo = footerKids.at(-1).end;

  // Back to front so earlier offsets stay valid.
  svg = svg.slice(0, cutFrom) + svg.slice(cutTo);
  svg = svg.slice(0, pie.start) + svg.slice(pie.end);
  writeFileSync(file, svg);
  console.log(`trim-3d: ${file}`);
}
