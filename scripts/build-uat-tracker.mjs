#!/usr/bin/env node
/**
 * Builds docs/uat/uat-tracker.html from the UAT markdown files (docs/uat/*.md).
 *
 * The tracker is one self-contained page a tester opens in the browser (no server needed). It shows the
 * cases one at a time, records Pass / Fail / Blocked with notes in the browser, and exports a CSV.
 *
 *   node scripts/build-uat-tracker.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const uatDir = path.join(root, "docs", "uat");
const out = path.join(uatDir, "uat-tracker.html");

// ---- A small, safe Markdown renderer (enough for the UAT files) -------------------------------
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function inline(text) {
  const codes = [];
  let s = text.replace(/`([^`]+)`/g, (_, c) => {
    codes.push(c);
    return `\u0000${codes.length - 1}\u0000`;
  });
  s = esc(s);
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, t, href) => {
    // Links to other UAT files point inside the tracker; web links open in a new tab.
    if (/^[0-9]{2}-[a-z-]+\.md$/.test(href) || href === "README.md") return `<a href="#" data-file="${esc(href)}">${t}</a>`;
    if (/^https?:\/\//.test(href)) return `<a href="${esc(href)}" target="_blank" rel="noopener">${t}</a>`;
    return t;
  });
  s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  s = s.replace(/(^|[\s(“"])\*([^*\s][^*]*?)\*(?=[\s).,;:!?”"]|$)/g, "$1<em>$2</em>");
  s = s.replace(/\u0000(\d+)\u0000/g, (_, i) => {
    const c = codes[Number(i)];
    const url = c.match(/^https?:\/\/localhost:\d+\S*$/) && !c.includes("<") ? c : null;
    return url
      ? `<a class="url" href="${esc(url)}" target="_blank" rel="noopener"><code>${esc(c)}</code></a>`
      : `<code class="copy" title="Click to copy">${esc(c)}</code>`;
  });
  return s;
}

function render(md) {
  const lines = md.replace(/\r\n/g, "\n").split("\n");
  let html = "";
  let i = 0;
  const isList = (l) => /^(\s*)([-*]|\d+\.)\s+/.test(l);
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      i++;
      continue;
    }
    if (line.startsWith("```")) {
      const buf = [];
      i++;
      while (i < lines.length && !lines[i].startsWith("```")) buf.push(lines[i++]);
      i++;
      html += `<pre><code>${esc(buf.join("\n"))}</code></pre>`;
      continue;
    }
    if (/^---+\s*$/.test(line)) {
      html += "<hr>";
      i++;
      continue;
    }
    const h = line.match(/^(#{1,4})\s+(.*)$/);
    if (h) {
      const n = Math.min(h[1].length + 1, 5);
      html += `<h${n}>${inline(h[2])}</h${n}>`;
      i++;
      continue;
    }
    if (line.startsWith(">")) {
      const buf = [];
      while (i < lines.length && lines[i].startsWith(">")) buf.push(lines[i++].replace(/^>\s?/, ""));
      html += `<blockquote>${render(buf.join("\n"))}</blockquote>`;
      continue;
    }
    if (line.trim().startsWith("|")) {
      const rows = [];
      while (i < lines.length && lines[i].trim().startsWith("|")) rows.push(lines[i++].trim());
      const cells = (r) => r.replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
      const body = rows.filter((r) => !/^\|[\s:|-]+\|$/.test(r));
      html += `<div class="tablewrap"><table><thead><tr>${cells(body[0]).map((c) => `<th>${inline(c)}</th>`).join("")}</tr></thead><tbody>${body
        .slice(1)
        .map((r) => `<tr>${cells(r).map((c) => `<td>${inline(c)}</td>`).join("")}</tr>`)
        .join("")}</tbody></table></div>`;
      continue;
    }
    if (isList(line)) {
      // Collect the whole list (items, nested items, continuation lines) and build it by indentation.
      const items = [];
      while (i < lines.length && lines[i].trim() && (isList(lines[i]) || /^\s+\S/.test(lines[i]))) {
        const m = lines[i].match(/^(\s*)([-*]|\d+\.)\s+(.*)$/);
        if (m) items.push({ indent: m[1].length, ordered: /\d/.test(m[2]), text: m[3] });
        else items[items.length - 1].text += " " + lines[i].trim();
        i++;
      }
      html += buildList(items, 0).html;
      continue;
    }
    const buf = [];
    while (i < lines.length && lines[i].trim() && !isList(lines[i]) && !/^(#|>|```|\|)/.test(lines[i].trim())) buf.push(lines[i++].trim());
    html += `<p>${inline(buf.join(" "))}</p>`;
  }
  return html;
}

function buildList(items, start) {
  const base = items[start].indent;
  const tag = items[start].ordered ? "ol" : "ul";
  let html = `<${tag}>`;
  let i = start;
  while (i < items.length && items[i].indent >= base) {
    if (items[i].indent > base) {
      const sub = buildList(items, i);
      html = html.replace(/<\/li>$/, "") + sub.html + "</li>";
      i = sub.next;
      continue;
    }
    html += `<li>${inline(items[i].text)}</li>`;
    i++;
  }
  return { html: html + `</${tag}>`, next: i };
}

// ---- Read the UAT files -------------------------------------------------------------------------
const files = fs
  .readdirSync(uatDir)
  .filter((f) => /^\d{2}-.*\.md$/.test(f))
  .sort();

const data = { built: new Date().toISOString(), guide: render(fs.readFileSync(path.join(uatDir, "README.md"), "utf8")), files: [] };
for (const f of files) {
  const md = fs.readFileSync(path.join(uatDir, f), "utf8");
  const title = (md.match(/^#\s+(.*)$/m) || [, f])[1].replace(/^\d+\s*·\s*/, "");
  const parts = md.split(/^### /m);
  const intro = parts[0].replace(/^#\s+.*$/m, "");
  const cases = parts.slice(1).map((p) => {
    const [head, ...rest] = p.split("\n");
    const m = head.match(/^(TC-[A-Z]+-\d+)\s*·\s*(.*?)(?:\s+—\s+(P\d))?\s*$/);
    const body = rest.join("\n").replace(/\n---\s*$/, "");
    const page = (body.match(/^- \*\*Page:\*\*(.*)$/m) || [, ""])[1];
    const firstUrl = (page.match(/http:\/\/localhost:\d+[^\s`)]*/) || [null])[0];
    return { id: m ? m[1] : head, title: m ? m[2] : head, priority: m?.[3] || "", html: render(body), url: firstUrl && !firstUrl.includes("<") ? firstUrl : null };
  });
  data.files.push({ file: f, title, intro: render(intro), cases });
}

const total = data.files.reduce((n, f) => n + f.cases.length, 0);
const template = fs.readFileSync(path.join(root, "scripts", "uat-tracker.template.html"), "utf8");
fs.writeFileSync(out, template.replace("/*__DATA__*/null", JSON.stringify(data).replace(/</g, "\\u003c")));
console.log(`UAT tracker: ${data.files.length} files, ${total} cases -> ${path.relative(root, out)}`);
