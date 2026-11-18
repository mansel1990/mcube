/** Renders the small subset used by content/philosophy.md. */
export function renderMarkdown(source: string): string {
  const blocks = source.replace(/\r\n/g, "\n").trim().split(/\n{2,}/);
  return blocks.map(renderBlock).join("\n");
}

function renderBlock(block: string): string {
  const lines = block.split("\n").map((line) => line.trim()).filter(Boolean);
  if (lines.length === 0) return "";
  if (lines.length === 1 && lines[0].startsWith("# ")) {
    return `<h1>${inline(lines[0].slice(2))}</h1>`;
  }
  let heading = "";
  let body = lines;
  if (/^\*\*[^*]+\*\*$/.test(lines[0])) {
    heading = `<h2>${inline(lines[0].slice(2, -2))}</h2>`;
    body = lines.slice(1);
  }
  if (body.length === 0) return heading;
  if (body.every((line) => line.startsWith("- "))) {
    return `${heading}<ul>${body.map((line) => `<li>${inline(line.slice(2))}</li>`).join("")}</ul>`;
  }
  if (body.every((line) => /^\d+\.\s/.test(line))) {
    return `${heading}<ol>${body.map((line) => `<li>${inline(line.replace(/^\d+\.\s/, ""))}</li>`).join("")}</ol>`;
  }
  return `${heading}<p>${body.map(inline).join(" ")}</p>`;
}

function inline(text: string): string {
  return escapeHtml(text).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
