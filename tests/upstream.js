// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright 2026 the ScarletNX contributors
//
// What theme/builder.js copies from ScarletNX: the parts of the GUI's code it does the same as, and the built-in
// themes. upstream.json keeps each part's SHA-256 as builder.js was last checked against it; upstream.test.js fetches
// ScarletNX's main and says which part changed since.
//
//   node tests/upstream.js --update    after builder.js follows main again: main's commit and hashes into upstream.json
"use strict";
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const REPO = "scarletnx/ScarletNX";
// file: the parts builder.js copies; "*" is the whole file, "words" main.c's items[] and SAY_* strings, any other
// name a function's definition, from its first line to the "}" that ends it
const PARTS = {
    "src/gui/theme.h": ["*"],
    "src/gui/theme.c": ["*"],
    "src/gui/steps.h": ["*"],
    "src/gui/steps.c": ["*"],
    "src/common/utilities/font.c": ["*"],
    "src/gui/model.c": ["gui_setting_description", "gui_slide", "gui_browser_pages", "gui_browser_items",
                        "gui_browser_resize", "gui_glyph", "clamp", "gui_console_init", "gui_console_resize", "newline",
                        "put_glyph", "feed_byte"],
    "src/gui/main.c": ["words", "rgb", "glyph", "text", "prompt", "band", "rule", "footer", "entry", "screen",
                       "recent_rows", "menu_last_row", "menu_row_in_full", "menu_offset", "menu_row", "recent_row",
                       "menu_shows", "recent_label", "menu_label", "entering", "pick_auto_scale", "layout", "text_px",
                       "fill", "arc", "ring", "dots", "run_name", "step_runs", "clip_row", "type_rows", "render_steps",
                       "overlay", "ask_question", "ask_box", "render_ask", "splash_shown", "render", "leave_run",
                       "launch", "initialize"]
};

// one part of a file's text, or null when the file has it no more
function part(source, name) {
    const lines = source.split("\n");
    if (name === "*") return source;
    if (name === "words") {
        const from = lines.findIndex(function (l) { return l.indexOf("static const char* const items[]") === 0; });
        const to = lines.findIndex(function (l) { return l.indexOf("static SDL_Color rgb(") === 0; });
        return from >= 0 && to > from ? lines.slice(from, to).join("\n") : null;
    }
    // a definition starts at the line's start, names the function before its "(" and is no declaration
    const head = new RegExp("^[A-Za-z_][^;=]*[ *]" + name + "\\(");
    for (let i = 0; i < lines.length; ++i) {
        if (!head.test(lines[i]) || /\);\s*$/.test(lines[i])) continue;
        if (/\}\s*$/.test(lines[i]) && /\{/.test(lines[i])) return lines[i];
        for (let j = i; j < lines.length; ++j) if (lines[j] === "}") return lines.slice(i, j + 1).join("\n");
    }
    return null;
}
function sha(text) { return text === null ? "missing" : crypto.createHash("sha256").update(text).digest("hex"); }

async function get(url, json) {
    const headers = { "User-Agent": "scarletnx.github.io checks" };
    if (url.indexOf("https://api.github.com/") === 0 && process.env.GITHUB_TOKEN)
        headers.Authorization = "Bearer " + process.env.GITHUB_TOKEN;
    const response = await fetch(url, { headers });
    if (!response.ok) throw new Error(url + ": HTTP " + response.status);
    return json ? response.json() : response.text();
}
function raw(ref, file) { return get("https://raw.githubusercontent.com/" + REPO + "/" + ref + "/" + file); }
async function mainCommit() { return (await get("https://api.github.com/repos/" + REPO + "/commits/main", true)).sha; }
// each part's hash at ref
async function hashes(ref) {
    const out = {};
    for (const file of Object.keys(PARTS)) {
        const source = await raw(ref, file);
        out[file] = {};
        PARTS[file].forEach(function (name) { out[file][name] = sha(part(source, name)); });
    }
    return out;
}
// the built-in themes: the folders of src/gui/themes at ref, and each one's theme.ini
async function builtins(ref) {
    const list = await get("https://api.github.com/repos/" + REPO + "/contents/src/gui/themes?ref=" + ref, true);
    const out = {};
    for (const entry of list.filter(function (e) { return e.type === "dir"; }))
        out[entry.name] = await raw(ref, "src/gui/themes/" + entry.name + "/theme.ini");
    return out;
}

module.exports = { REPO, PARTS, part, sha, hashes, builtins, mainCommit };

if (require.main === module && process.argv[2] === "--update") {
    (async function () {
        const commit = await mainCommit();
        const record = { commit: commit, parts: await hashes(commit) };
        fs.writeFileSync(path.join(__dirname, "upstream.json"), JSON.stringify(record, null, 1) + "\n");
        Object.keys(record.parts).forEach(function (file) {
            Object.keys(record.parts[file]).forEach(function (name) {
                if (record.parts[file][name] === "missing") console.log("missing on main: " + file + " " + name);
            });
        });
        console.log("upstream.json: " + REPO + " " + commit);
    })().catch(function (e) {
        console.error(e.message);
        process.exit(1);
    });
}
