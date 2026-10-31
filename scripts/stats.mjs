// Builds the stats card (light + dark) from the GitHub GraphQL API.
// Usage: GITHUB_TOKEN=... USERNAME=... node scripts/stats.mjs <outDir>
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const token = process.env.GITHUB_TOKEN;
const login = process.env.USERNAME;
const outDir = process.argv[2] ?? "dist";
if (!token || !login) throw new Error("GITHUB_TOKEN and USERNAME are required");

async function gql(query, variables) {
  const res = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: { authorization: `bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({ query, variables }),
  });
  const json = await res.json();
  if (json.errors) throw new Error(JSON.stringify(json.errors));
  return json.data;
}

const { user } = await gql(
  `query($login: String!) {
    user(login: $login) {
      repositories(ownerAffiliations: OWNER, isFork: false, privacy: PUBLIC, first: 100) {
        totalCount
        nodes {
          languages(first: 10, orderBy: { field: SIZE, direction: DESC }) {
            edges { size node { name color } }
          }
        }
      }
    }
  }`,
  { login },
);

const langs = new Map();
for (const repo of user.repositories.nodes) {
  for (const { size, node } of repo.languages.edges) {
    const l = langs.get(node.name) ?? { size: 0, color: node.color ?? "#8b8b95" };
    l.size += size;
    langs.set(node.name, l);
  }
}
const langTotal = [...langs.values()].reduce((s, l) => s + l.size, 0) || 1;
const top = [...langs.entries()]
  .sort(([, a], [, b]) => b.size - a.size)
  .slice(0, 6)
  .map(([name, l]) => ({ name, color: l.color, pct: (l.size / langTotal) * 100 }));

const themes = {
  light: { bg: "#ffffff", border: "#d0d7de", ink: "#1f2328", muted: "#656d76", track: "#eaeef2" },
  dark: { bg: "#0d1117", border: "#30363d", ink: "#e6edf3", muted: "#8d96a0", track: "#21262d" },
};

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const fmt = (n) => n.toLocaleString("de-CH");

function card(t) {
  const W = 840;
  const H = 160;
  const font = `-apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans", Helvetica, Arial, sans-serif`;
  const repos = `<text x="32" y="92" font-size="52" font-weight="600" fill="${t.ink}">${fmt(user.repositories.totalCount)}</text>
    <text x="32" y="120" font-size="13" fill="${t.muted}">Öffentliche Repos</text>`;

  const barX = 264;
  const barW = W - barX - 32;
  let acc = 0;
  const segments = top
    .map((l) => {
      const w = (l.pct / 100) * barW;
      const seg = `<rect x="${(barX + acc).toFixed(1)}" y="52" width="${Math.max(w - 2, 1).toFixed(1)}" height="8" fill="${l.color}"/>`;
      acc += w;
      return seg;
    })
    .join("");
  const legend = top
    .map((l, i) => {
      const x = barX + (i % 3) * (barW / 3);
      const y = 94 + Math.floor(i / 3) * 30;
      return `<circle cx="${x + 5}" cy="${y - 4}" r="5" fill="${l.color}"/>
    <text x="${x + 18}" y="${y}" font-size="14" fill="${t.ink}">${esc(l.name)} <tspan fill="${t.muted}">${l.pct.toFixed(1)}%</tspan></text>`;
    })
    .join("\n    ");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family='${font}' role="img" aria-label="GitHub-Statistik von ${esc(login)}">
  <rect x="0.5" y="0.5" width="${W - 1}" height="${H - 1}" rx="12" fill="${t.bg}" stroke="${t.border}"/>
  <g>
    ${repos}
  </g>
  <line x1="${barX - 32}" y1="32" x2="${barX - 32}" y2="${H - 32}" stroke="${t.border}"/>
  <text x="${barX}" y="38" font-size="13" fill="${t.muted}">Meistgenutzte Sprachen</text>
  <clipPath id="bar"><rect x="${barX}" y="52" width="${barW}" height="8" rx="4"/></clipPath>
  <rect x="${barX}" y="52" width="${barW}" height="8" rx="4" fill="${t.track}"/>
  <g clip-path="url(#bar)">${segments}</g>
  <g>
    ${legend}
  </g>
</svg>
`;
}

mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, "stats.svg"), card(themes.light));
writeFileSync(join(outDir, "stats-dark.svg"), card(themes.dark));
console.log(`stats: ${user.repositories.totalCount} repos, ${top.length} languages`);
