import ReactInspector from "vite-plugin-react-inspector";
import type { Plugin } from "vite";
import fs from "node:fs";
import path from "node:path";

export interface CelestialReactInspectorOptions {
  /**
   * Default: true
   */
  enabled?: boolean;
}

export function celestialReactInspector(options: CelestialReactInspectorOptions = {}): Plugin[] {
  const enabled = options.enabled ?? true;
  if (!enabled) return [];

  const inspector = ReactInspector();

  // vite-plugin-react-inspector will inject `/node_modules/.../inject.jsx`, which relies on
  // legacy `react-dom.render` (broken on React 19) and may also be blocked by dev server fs rules.
  // We provide a runtime overlay via inline module script instead.
  const patchedInspector: Plugin = {
    ...inspector,
    transformIndexHtml: undefined,
  };

  return [patchedInspector, reactInspectorTypeArgumentsFix(), injectReactInspectorOverlay()];
}

export function reactInspectorTypeArgumentsFix(): Plugin {
  return {
    name: "celestial-react-inspector-type-arguments-fix",
    apply: "serve",
    enforce: "pre",
    transform(code, id) {
      if (!id.endsWith(".tsx") && !id.endsWith(".jsx")) return;
      if (!code.includes("data-react-inspector")) return;

      let out = "";
      let lastIndex = 0;
      let cursor = 0;

      while (true) {
        const attrStart = code.indexOf(' data-react-inspector="', cursor);
        if (attrStart === -1) break;

        const tagStart = code.lastIndexOf("<", attrStart);
        if (tagStart === -1) {
          cursor = attrStart + 1;
          continue;
        }

        let nameEnd = tagStart + 1;
        while (nameEnd < code.length) {
          const ch = code[nameEnd];
          if (
            ch === " " ||
            ch === "\n" ||
            ch === "\t" ||
            ch === "\r" ||
            ch === ">" ||
            ch === "/" ||
            ch === "<"
          ) {
            break;
          }
          nameEnd += 1;
        }

        // Only handle the exact broken shape:
        //   <Tag data-react-inspector="..."<TypeArgs>
        // In which case, `attrStart` should immediately follow the tag name.
        if (nameEnd !== attrStart) {
          cursor = attrStart + 1;
          continue;
        }

        const valueStart = attrStart + ' data-react-inspector="'.length;
        const valueEndQuote = code.indexOf('"', valueStart);
        if (valueEndQuote === -1) {
          cursor = attrStart + 1;
          continue;
        }

        const afterQuote = valueEndQuote + 1;
        if (code[afterQuote] !== "<") {
          cursor = afterQuote;
          continue;
        }

        const typeEnd = findMatchingAngleBracketEnd(code, afterQuote);
        if (typeEnd === -1) {
          cursor = afterQuote + 1;
          continue;
        }

        const attrText = code.slice(attrStart, valueEndQuote + 1);
        out += code.slice(lastIndex, attrStart);
        out += code.slice(afterQuote, typeEnd + 1);
        out += attrText;

        lastIndex = typeEnd + 1;
        cursor = lastIndex;
      }

      if (!out) return;
      out += code.slice(lastIndex);
      return out;
    },
  };
}

function findMatchingAngleBracketEnd(code: string, start: number): number {
  if (code[start] !== "<") return -1;

  let depth = 0;
  let inString: "'" | '"' | null = null;

  for (let i = start; i < code.length; i += 1) {
    const ch = code[i];

    if (inString) {
      if (ch === "\\") {
        i += 1;
        continue;
      }
      if (ch === inString) {
        inString = null;
      }
      continue;
    }

    if (ch === "'" || ch === '"') {
      inString = ch;
      continue;
    }

    if (ch === "<") {
      depth += 1;
      continue;
    }

    if (ch === ">") {
      depth -= 1;
      if (depth === 0) return i;
    }
  }

  return -1;
}

export function injectReactInspectorOverlay(): Plugin {
  let repoRoot = "";

  const buildCode = (repoRootPath: string) =>
    `
(function () {
  function init() {
    try {
      if (window.__CE_REACT_INSPECTOR_OVERLAY__) return;

      var ACTIVE_KEY = "__ce_react_inspector_active__";
      var __repoRoot = ${JSON.stringify(repoRootPath)};

    var css = [
      '#ce-react-inspector-toggle{position:fixed;right:16px;bottom:16px;z-index:2147483647;font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;}',
      '#ce-react-inspector-toggle button{all:unset;cursor:pointer;user-select:none;padding:8px 10px;border-radius:10px;background:rgba(17,24,39,.92);color:#fff;font-size:12px;line-height:1;box-shadow:0 6px 20px rgba(0,0,0,.22);}',
      '#ce-react-inspector-toggle button[data-active="1"]{background:rgba(22,119,255,.95);}',
      '#ce-react-inspector-tooltip{position:fixed;z-index:2147483647;max-width:720px;pointer-events:auto;display:none;padding:10px 12px;border-radius:10px;background:rgba(0,0,0,.78);color:#fff;font-size:12px;line-height:1.35;white-space:nowrap;backdrop-filter:blur(6px);}',
      '#ce-react-inspector-tooltip code{font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace;}',
      '#ce-react-inspector-tooltip .ce-ri-row{display:flex;align-items:center;gap:10px;}',
      '#ce-react-inspector-tooltip .ce-ri-row code{display:block;max-width:600px;overflow:hidden;text-overflow:ellipsis;}',
      '#ce-react-inspector-tooltip .ce-ri-meta{opacity:.92;margin-top:4px;}',
      '#ce-react-inspector-copy{all:unset;cursor:pointer;user-select:none;padding:3px 8px;border-radius:8px;background:rgba(255,255,255,.12);color:#fff;font-size:12px;line-height:1;box-shadow:0 4px 14px rgba(0,0,0,.18);}',
      '#ce-react-inspector-copy:hover{background:rgba(255,255,255,.18);}',
      '#ce-react-inspector-copy:active{transform:translateY(1px);}',
      '#ce-react-inspector-highlight{position:fixed;left:0;top:0;width:0;height:0;display:none;pointer-events:none;z-index:2147483646;border:2px solid rgba(22,119,255,.95);background:rgba(22,119,255,.10);border-radius:10px;box-sizing:border-box;}',
    ].join("\\n");

    var style = document.createElement("style");
    style.setAttribute("data-ce-react-inspector", "1");
    style.appendChild(document.createTextNode(css));
    document.head.appendChild(style);

    var root = document.createElement("div");
    root.id = "ce-react-inspector-toggle";
    var btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = "React Inspector";
    root.appendChild(btn);
    document.body.appendChild(root);

    var tooltip = document.createElement("div");
    tooltip.id = "ce-react-inspector-tooltip";
    document.body.appendChild(tooltip);

    var highlight = document.createElement("div");
    highlight.id = "ce-react-inspector-highlight";
    document.body.appendChild(highlight);

    var active = false;
    var frozen = false;

    var normalizePath = function (value) {
      try {
        return String(value || "").replaceAll("\\\\", "/");
      } catch (e) {
        return "";
      }
    };

    var stripQueryAndHash = function (value) {
      try {
        var s = String(value || "");
        var q = s.indexOf("?");
        var h = s.indexOf("#");
        var cut = -1;
        if (q !== -1 && h !== -1) cut = Math.min(q, h);
        else cut = q !== -1 ? q : h;
        return cut === -1 ? s : s.slice(0, cut);
      } catch (e) {
        return String(value || "");
      }
    };

    var toRepoRelativePath = function (absPath) {
      try {
        var abs = normalizePath(stripQueryAndHash(absPath));
        var root = normalizePath(__repoRoot);
        if (!root) return abs;

        // case-insensitive match for Windows paths
        var absLower = abs.toLowerCase();
        var rootLower = root.toLowerCase();
        if (absLower.indexOf(rootLower) === 0) {
          var rel = abs.slice(root.length);
          if (rel[0] === "/") rel = rel.slice(1);
          return rel || abs;
        }
        return abs;
      } catch (e) {
        return String(absPath || "");
      }
    };

    var parseFileDetail = function (value) {
      try {
        var parts = String(value).split(":");
        if (parts.length < 3) return null;
        var col = parts[parts.length - 1];
        var line = parts[parts.length - 2];
        var filePath = parts.slice(0, parts.length - 2).join(":");
        return { filePath: filePath, line: line, col: col };
      } catch (e) {
        return null;
      }
    };

    var isOverlayElement = function (el) {
      try {
        if (!el || !el.closest) return 0;
        if (el.closest("#ce-react-inspector-toggle")) return 1;
        if (el.closest("#ce-react-inspector-tooltip")) return 1;
        if (el.closest("#ce-react-inspector-highlight")) return 1;
        return 0;
      } catch (e) {
        return 0;
      }
    };

    var freezeHoverUi = function (next) {
      try {
        frozen = !!next;
        if (frozen) highlight.style.display = "none";
      } catch (e) {}
    };

    var pickNearestInspectorElement = function (startEl) {
      try {
        if (!startEl) return null;
        var el = startEl;
        if (el && el.nodeType === 3) el = el.parentElement;
        if (!el || !el.closest) return null;
        if (isOverlayElement(el)) return null;

        var direct = el.closest("[data-react-inspector]");
        if (direct) return direct;

        var current = el;
        var level = 0;
        while (current && level < 4) {
          var parent = current.parentElement;
          if (!parent) break;

          var prev = current.previousElementSibling;
          var next = current.nextElementSibling;

          var candidates = [prev, next, parent];
          for (var i = 0; i < candidates.length; i += 1) {
            var c = candidates[i];
            if (!c || isOverlayElement(c)) continue;
            if (c.getAttribute && c.getAttribute("data-react-inspector")) return c;
            if (c.querySelector) {
              var inside = c.querySelector("[data-react-inspector]");
              if (inside) return inside;
            }
          }

          current = parent;
          level += 1;
        }
        return null;
      } catch (e) {
        return null;
      }
    };

    var findTarget = function (evtTarget) {
      try {
        if (!evtTarget) return null;
        var hit = pickNearestInspectorElement(evtTarget);
        if (!hit) return null;
        var v = hit.getAttribute("data-react-inspector");
        return v ? { el: hit, value: v } : null;
      } catch (e) {
        return null;
      }
    };

    var hideHoverUI = function () {
      try {
        tooltip.style.display = "none";
        highlight.style.display = "none";
      } catch (e) {}
    };

    var showHighlightForElement = function (el) {
      try {
        if (!el || !el.getBoundingClientRect) {
          highlight.style.display = "none";
          return;
        }
        var r = el.getBoundingClientRect();
        if (!r || r.width <= 0 || r.height <= 0) {
          highlight.style.display = "none";
          return;
        }
        var pad = 2;
        var left = Math.max(0, r.left - pad);
        var top = Math.max(0, r.top - pad);
        var width = Math.min(window.innerWidth, r.width + pad * 2);
        var height = Math.min(window.innerHeight, r.height + pad * 2);

        highlight.style.display = "block";
        highlight.style.left = left + "px";
        highlight.style.top = top + "px";
        highlight.style.width = width + "px";
        highlight.style.height = height + "px";
      } catch (e) {
        highlight.style.display = "none";
      }
    };

    var writeClipboard = function (text) {
      try {
        var t = String(text || "");
        if (!t) return;

        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(t).catch(function () {});
          return;
        }

        var ta = document.createElement("textarea");
        ta.value = t;
        ta.setAttribute("readonly", "1");
        ta.style.position = "fixed";
        ta.style.left = "-9999px";
        ta.style.top = "-9999px";
        document.body.appendChild(ta);
        ta.select();
        try {
          document.execCommand("copy");
        } catch (e) {}
        ta.remove();
      } catch (e) {}
    };

    var renderTooltip = function (displayPath, detail) {
      try {
        tooltip.innerHTML = "";

        var row = document.createElement("div");
        row.className = "ce-ri-row";

        var codeEl = document.createElement("code");
        codeEl.textContent = String(displayPath || "");
        row.appendChild(codeEl);

        var copyBtn = document.createElement("button");
        copyBtn.type = "button";
        copyBtn.id = "ce-react-inspector-copy";
        copyBtn.textContent = "复制";
        copyBtn.setAttribute(
          "data-copy",
          String(displayPath || "") + ":" + String(detail.line) + ":" + String(detail.col)
        );
        row.appendChild(copyBtn);

        tooltip.appendChild(row);

        var meta = document.createElement("div");
        meta.className = "ce-ri-meta";
        meta.textContent =
          "提示：Alt+Click 打开编辑器  ·  line: " + String(detail.line) + "  col: " + String(detail.col);
        tooltip.appendChild(meta);
      } catch (e) {}
    };

    var setActive = function (next) {
      active = !!next;
      btn.dataset.active = active ? "1" : "0";
      try {
        window[ACTIVE_KEY] = active ? 1 : 0;
      } catch (e) {}
      if (!active) {
        hideHoverUI();
      }
    };

    var onMouseMove = function (e) {
      try {
        if (!active) return;
        if (frozen) return;
        if (isOverlayElement(e.target)) return;
        var hit = findTarget(e.target);
        if (!hit) {
          hideHoverUI();
          return;
        }
        var detail = parseFileDetail(hit.value);
        if (!detail) {
          hideHoverUI();
          return;
        }
        var displayPath = toRepoRelativePath(detail.filePath);
        renderTooltip(displayPath, detail);
        showHighlightForElement(hit.el);

        tooltip.style.display = "block";
        var left = e.clientX + 12;
        var top = e.clientY + 12;
        var maxLeft = window.innerWidth - 20;
        var maxTop = window.innerHeight - 20;
        tooltip.style.left = Math.min(maxLeft, left) + "px";
        tooltip.style.top = Math.min(maxTop, top) + "px";
      } catch (err) {
        hideHoverUI();
      }
    };

    var onClick = function (e) {
      try {
        if (!active) return;

        // 点击 overlay 自身：不要影响开关 / 复制按钮交互
        if (e && e.target && e.target.closest) {
          if (e.target.closest("#ce-react-inspector-toggle")) return;
          if (e.target.closest("#ce-react-inspector-tooltip")) {
            var copyEl2 = e.target.closest("#ce-react-inspector-copy");
            if (copyEl2) {
              var text2 = copyEl2.getAttribute("data-copy") || "";
              writeClipboard(text2);
              if (e.preventDefault) e.preventDefault();
              if (e.stopPropagation) e.stopPropagation();
              return;
            }
            if (e.preventDefault) e.preventDefault();
            if (e.stopPropagation) e.stopPropagation();
            return;
          }
        }

        // Inspector 模式下屏蔽原交互，避免点击触发跳转/提交等
        if (e.preventDefault) e.preventDefault();
        if (e.stopPropagation) e.stopPropagation();

        // 只有 Alt+Click 才触发打开编辑器
        if (!e.altKey) return;

        var hit = findTarget(e.target);
        if (!hit) return;
        var url = "/__react-inspector-launch-editor?file=" + encodeURIComponent(hit.value);
        fetch(url).catch(function () {});
      } catch (err) {}
    };

    btn.addEventListener("click", function () {
      setActive(!active);
    });

    root.addEventListener("mouseenter", function () {
      freezeHoverUi(1);
    });
    root.addEventListener("mouseleave", function () {
      freezeHoverUi(0);
    });

    tooltip.addEventListener("mouseenter", function () {
      freezeHoverUi(1);
    });
    tooltip.addEventListener("mouseleave", function () {
      freezeHoverUi(0);
    });

    document.addEventListener("mousemove", onMouseMove, { passive: !!1 });
    document.addEventListener("click", onClick, 1);

    setActive(false);

      try {
        window.__CE_REACT_INSPECTOR_OVERLAY__ = 1;
      } catch (e) {}
    } catch (e) {}
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

})();
`.trim();

  return {
    name: "celestial-react-inspector-overlay",
    apply: "serve",
    enforce: "post",
    configResolved(config) {
      repoRoot = normalizeToPosix(findRepoRoot(config.root));
    },
    transformIndexHtml() {
      return [
        {
          tag: "script",
          attrs: {},
          children: buildCode(repoRoot),
          injectTo: "head-prepend",
        },
      ];
    },
  };
}

function normalizeToPosix(value: string): string {
  return value.replaceAll("\\", "/");
}

function findRepoRoot(startDir: string): string {
  let current = startDir;
  for (let i = 0; i < 32; i += 1) {
    if (
      fs.existsSync(path.join(current, "pnpm-workspace.yaml")) ||
      fs.existsSync(path.join(current, "turbo.json")) ||
      fs.existsSync(path.join(current, ".git"))
    ) {
      return current;
    }

    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return startDir;
}
