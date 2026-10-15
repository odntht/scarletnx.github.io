// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright 2026 the ScarletNX contributors
//
// What the theme builder takes from ScarletNX, and how to fetch it: the parts of the GUI's code builder.js does the
// same as (upstream.json keeps each one's SHA-256 as builder.js was last checked against it), the built-in themes
// (theme/themes.js), the program's icon (theme/icon.js), the words the screens say, and the theme format fixtures.
// upstream.test.js compares them with ScarletNX's main.
//
//   node tests/upstream.js --update [REF]   after builder.js follows ScarletNX again: REF's (main by default) commit,
//                                          hashes, themes and icon into upstream.json, theme/themes.js, theme/icon.js
"use strict";
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const REPO = "scarletnx/ScarletNX";
const MAIN = "src/gui/main.c", MODEL = "src/gui/model.c", FONT = "src/common/utilities/font.c";
const ICON = "dist/icons/hicolor/128x128/apps/wimsy.png";
// [name, files]: a file's path alone is the whole file; "words" is main.c's items[] and SAY_* strings; any other name
// a definition (a function, or an array) from its first line to the line that closes it, in the first of its files
// that has it (a function may move between them)
const PARTS = [
    ["src/gui/theme.h"], ["src/gui/theme.c"], ["src/gui/steps.h"], ["src/gui/steps.c"],
    ["gui_vga_font", [FONT]], ["gui_codepage", [FONT]], ["gui_glyph", [MODEL, FONT]]
].concat(["gui_setting_description", "gui_slide", "gui_browser_pages", "gui_browser_items", "gui_browser_resize",
          "clamp", "gui_console_init", "gui_console_resize", "newline", "put_glyph", "feed_byte"]
    .map(function (name) { return [name, [MODEL]]; }))
    .concat(["words", "rgb", "glyph", "text", "prompt", "band", "rule", "footer", "entry", "screen", "recent_rows",
             "menu_last_row", "menu_row_in_full", "menu_offset", "menu_row", "recent_row", "menu_shows", "recent_label",
             "menu_label", "entering", "pick_auto_scale", "layout", "text_px", "fill", "arc", "ring", "dots", "run_name",
             "step_runs", "clip_row", "type_rows", "render_steps", "overlay", "ask_question", "ask_box", "render_ask",
             "splash_shown", "render", "leave_run", "launch", "initialize"]
        .map(function (name) { return [name, [MAIN]]; }));

// one part of a file's text, or null when the file has it no more
function part(source, name) {
    const lines = source.split("\n");
    if (name === "words") {
        const from = lines.findIndex(function (l) { return l.indexOf("static const char* const items[]") === 0; });
        const to = lines.findIndex(function (l) { return l.indexOf("static SDL_Color rgb(") === 0; });
        return from >= 0 && to > from ? lines.slice(from, to).join("\n") : null;
    }
    // a definition starts at the line's start, names the function or array before its "(" or "[", declares nothing
    const head = new RegExp("^[A-Za-z_][^;=]*[ *]" + name + "\\s*[(\\[]");
    for (let i = 0; i < lines.length; ++i) {
        if (!head.test(lines[i]) || /\);\s*$/.test(lines[i])) continue;
        if (/\}\s*;?\s*$/.test(lines[i]) && /\{/.test(lines[i])) return lines[i];
        for (let j = i; j < lines.length; ++j)
            if (lines[j] === "}" || lines[j] === "};") return lines.slice(i, j + 1).join("\n");
    }
    return null;
}
function sha(text) { return text === null ? "missing" : crypto.createHash("sha256").update(text).digest("hex"); }

async function get(url, as) {
    const headers = { "User-Agent": "scarletnx.github.io checks" };
    if (url.indexOf("https://api.github.com/") === 0 && process.env.GITHUB_TOKEN)
        headers.Authorization = "Bearer " + process.env.GITHUB_TOKEN;
    const response = await fetch(url, { headers });
    if (response.status === 404 && as === "maybe") return null;
    if (!response.ok) throw new Error(url + ": HTTP " + response.status);
    if (as === "json" || as === "maybe") return response.json();
    const bytes = new Uint8Array(await response.arrayBuffer());
    return as === "bytes" ? bytes : new TextDecoder("utf-8", { ignoreBOM: true }).decode(bytes);
}
function raw(ref, file, as) { return get("https://raw.githubusercontent.com/" + REPO + "/" + ref + "/" + file, as); }
function api(what, as) { return get("https://api.github.com/repos/" + REPO + "/" + what, as || "json"); }
async function commitOf(ref) { return (await api("commits/" + ref)).sha; }
// each part's hash at ref, by its name
async function hashes(ref) {
    const sources = {}, out = {};
    for (const p of PARTS) {
        let text = null;
        for (const file of p[1] || [p[0]]) {
            if (!(file in sources)) sources[file] = await raw(ref, file);
            text = p[1] ? part(sources[file], p[0]) : sources[file];
            if (text !== null) break;
        }
        out[p[0]] = sha(text);
    }
    return out;
}
// the built-in themes at ref: each folder of src/gui/themes with its theme.ini, as text
async function builtins(ref) {
    const list = await api("contents/src/gui/themes?ref=" + ref);
    const out = {};
    for (const entry of list.filter(function (e) { return e.type === "dir"; }))
        out[entry.name] = await raw(ref, "src/gui/themes/" + entry.name + "/theme.ini");
    return out;
}
// ScarletNX's theme format fixtures at ref: { format: { name: { ini (bytes), json } } }; null when it has none
async function fixtures(ref) {
    const formats = await api("contents/tests/gui_themes?ref=" + ref, "maybe");
    if (!formats) return null;
    const out = {};
    for (const dir of formats.filter(function (e) { return e.type === "dir" && /^\d+$/.test(e.name); })) {
        out[dir.name] = {};
        const files = await api("contents/tests/gui_themes/" + dir.name + "?ref=" + ref);
        for (const f of files.filter(function (e) { return /\.ini$/.test(e.name); })) {
            const name = f.name.slice(0, -4), base = "tests/gui_themes/" + dir.name + "/" + name;
            out[dir.name][name] = { ini: await raw(ref, base + ".ini", "bytes"),
                                    json: JSON.parse(await raw(ref, base + ".json")) };
        }
    }
    return out;
}
// The words the screens say, as main.c and model.c have them: { computer: {...}, phone: {...} } in builder.js's SAY
// names; null when main.c's words are no longer where this looks. main.c's first Android block holds the phone's,
// its #else the computer's; model.c's descriptions likewise
function words(mainC, modelC) {
    const out = { computer: {}, phone: {} }, str = "(\"(?:[^\"\\\\]|\\\\.)*\")";
    const block = /#ifdef SDL_PLATFORM_ANDROID\n(static const char\* const load_labels[\s\S]*?)#else\n([\s\S]*?)#endif/
        .exec(mainC);
    if (!block) return null;
    const names = { SAY_MENU: "menu", SAY_LOAD: "loadHow", SAY_GAMES: "games", SAY_KEYS: "keys", SAY_KEYS_HOW: "keysHow",
                    SAY_KEYS_WAIT: "keysWait", SAY_DONE: "done", SAY_ABORT: "abort", SAY_COUNT: "count" };
    [["phone", block[1]], ["computer", block[2]]].forEach(function (b) {
        const labels = new RegExp("load_labels\\[\\] = \\{" + str + ", " + str + "\\}").exec(b[1]);
        if (labels) out[b[0]].load = [JSON.parse(labels[1]), JSON.parse(labels[2])];
        const define = new RegExp("#define (SAY_\\w+)\\s+" + str, "g");
        let m;
        while ((m = define.exec(b[1]))) if (names[m[1]]) out[b[0]][names[m[1]]] = JSON.parse(m[2]);
    });
    [["GUI_FULLSCREEN", "fullscreen"], ["GUI_LOG", "log"]].forEach(function (c) {
        const m = new RegExp("case " + c[0] + ":\\s*#ifdef __ANDROID__\\s*return " + str + ";\\s*#else\\s*return " + str +
                             ";").exec(modelC);
        if (m) {
            out.phone[c[1]] = JSON.parse(m[1]);
            out.computer[c[1]] = JSON.parse(m[2]);
        }
    });
    return out;
}
// a JS string literal of text, ASCII only
function literal(text) {
    return JSON.stringify(text).replace(/[\u0080-\uffff]/g, function (c) {
        return "\\u" + ("000" + c.charCodeAt(0).toString(16).toUpperCase()).slice(-4);
    });
}

module.exports = { REPO, PARTS, ICON, MAIN, MODEL, part, sha, raw, hashes, builtins, fixtures, words, commitOf };

if (require.main === module && process.argv[2] === "--update") {
    (async function () {
        const commit = await commitOf(process.argv[3] || "main"), site = path.join(__dirname, "..");
        fs.writeFileSync(path.join(__dirname, "upstream.json"),
                         JSON.stringify({ commit: commit, parts: await hashes(commit) }, null, 1) + "\n");
        const themes = await builtins(commit);
        fs.writeFileSync(path.join(site, "theme/themes.js"),
            "// ScarletNX's built-in themes, its src/gui/themes/<id>/theme.ini as they are at " + commit.slice(0, 7) +
            ": the page's\n// own copies, for when ScarletNX's main cannot be fetched. Made by node tests/upstream.js " +
            "--update; tests/upstream.test.js\n// checks them against main\nvar SNX_THEMES = {\n" +
            Object.keys(themes).map(function (id) { return "    " + literal(id) + ": " + literal(themes[id]); }).join(",\n") +
            "\n};\nif (typeof module !== \"undefined\") module.exports = { SNX_THEMES: SNX_THEMES };\n");
        const icon = Buffer.from(await raw(commit, ICON, "bytes")).toString("base64");
        fs.writeFileSync(path.join(site, "theme/icon.js"),
            "// The ScarletNX program's icon, the one the GUI's splash shows: " + ICON + " at " + commit.slice(0, 7) +
            ",\n// as it is, base64. Made by node tests/upstream.js --update; tests/upstream.test.js checks it against " +
            "main\nvar SNX_ICON_PNG = \"\" +\n" + icon.match(/.{1,112}/g).map(function (l) { return "    \"" + l + "\""; })
                .join(" +\n") + ";\nif (typeof module !== \"undefined\") module.exports = { SNX_ICON_PNG: SNX_ICON_PNG };\n");
        const record = JSON.parse(fs.readFileSync(path.join(__dirname, "upstream.json"), "utf8"));
        Object.keys(record.parts).forEach(function (name) {
            if (record.parts[name] === "missing") console.log("missing at " + commit.slice(0, 7) + ": " + name);
        });
        console.log("upstream.json, theme/themes.js (" + Object.keys(themes).join(", ") + ") and theme/icon.js: " + REPO +
                    " " + commit);
    })().catch(function (e) {
        console.error(e.message);
        process.exit(1);
    });
}
