// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright 2026 the ScarletNX contributors
//
// The frames render.test.js checks theme/builder.js against: each state below as ScarletNX's own GUI drew it, its
// pixels' SHA-256 kept in golden.json. The GUI drew them through tools/gui-ref (README.md there), which builds
// src/gui/main.c with SDL's software renderer and the dummy video driver and sets these same states.
"use strict";
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

// the built-ins, and test themes for the keys the built-ins leave off
const THEMES = {
    default: { builtin: "default" },
    yorha: { builtin: "yorha" },
    console: { file: "console-bars.ini" },
    left: { file: "steps-left-slide.ini" },
    near: { file: "steps-near-fade.ini" },
    async: { file: "steps-async-eret.ini" }
};
// views at a clock (ms): a run's lines come at builder.js's RUN ms; 1450 has a line coming in, 2700 is mid-recompile,
// 6550 after the game's banner
const VIEWS = [["menu", 1000], ["load", 1000], ["games", 1000], ["keys", 1000], ["run", 1450], ["run", 2700],
               ["run", 6550], ["ended", 10000], ["failed", 10700], ["ask", 7000], ["aborting", 4000]];

// a phone's words and folders (main.c's and model.c's Android ones, gui-ref-phone) on a few of them
const PHONE_THEMES = ["default", "yorha", "console"];
const PHONE_VIEWS = [["menu", 1000], ["load", 1000], ["games", 1000], ["keys", 1000], ["run", 2700], ["ended", 10000],
                     ["ask", 7000]];

function cases() {
    const out = [];
    function add(theme, view, clock, scale, phone) {
        out.push({ name: theme + "-" + view + "-" + clock + "-" + scale + "x" + (phone ? "-phone" : ""), theme: theme,
                   view: view, clock: clock, scale: scale, phone: phone });
    }
    Object.keys(THEMES).forEach(function (theme) {
        VIEWS.concat([["splash", 1000]]).forEach(function (v) {
            [2, 1].forEach(function (scale) { add(theme, v[0], v[1], scale, false); });
        });
    });
    PHONE_THEMES.forEach(function (theme) {
        PHONE_VIEWS.forEach(function (v) {
            [2, 1].forEach(function (scale) { add(theme, v[0], v[1], scale, true); });
        });
    });
    return out;
}
function themeFile(key) { return THEMES[key].file ? path.join(__dirname, "themes", THEMES[key].file) : null; }
function theme(B, key) {
    return THEMES[key].builtin ? B.builtin(THEMES[key].builtin) : B.parse(fs.readFileSync(themeFile(key)), "ref");
}
function state(B, c) {
    const s = B.sampleState(c.view, !!c.phone);
    s.scale = c.scale;
    s.keysThere = false; // gui-ref's keys path (sampleState's) is not there
    return s;
}
// the frame's red, green and blue bytes, hashed
function hash(rgba) {
    const rgb = Buffer.alloc(rgba.length / 4 * 3);
    for (let i = 0, j = 0; i < rgba.length; i += 4, j += 3) {
        rgb[j] = rgba[i];
        rgb[j + 1] = rgba[i + 1];
        rgb[j + 2] = rgba[i + 2];
    }
    return crypto.createHash("sha256").update(rgb).digest("hex");
}
function draw(B, c) {
    const surface = new B.Surface(640 * c.scale, 400 * c.scale);
    B.render(surface, theme(B, c.theme), state(B, c), c.clock);
    return surface;
}
module.exports = { THEMES, VIEWS, cases, themeFile, theme, state, hash, draw };
