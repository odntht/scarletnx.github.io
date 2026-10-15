#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright 2026 the ScarletNX contributors
//
// The theme builder against ScarletNX's own GUI (README.md): theme/builder.js and gui-ref draw the same state at the
// same clock, and the two are compared pixel by pixel; then builder.js's parse and theme.c's (gui-ref parse) read the
// same files.
//
//   node tools/gui-ref/compare.js --ref REF_DIR --checkout SCARLETNX_CHECKOUT --out DIR [--only TEXT]
//                                 [--render-only | --parse-only] [--keep] [--golden COMMIT] [--site SITE]
//
// REF_DIR holds gui-ref and gui-ref-phone (build-gui-ref.sh); the checkout is the one they were built from, for its
// built-in theme files; SITE is this repo, the default. A frame passes when every pixel matches, but inside the ring's
// box (its arcs go through cosf, which libm may round a last bit apart from JS) and, on a frame drawn with an alpha
// under 1 (a fade, a line coming in), a channel 2 apart at most. A failing frame leaves ref.png, ours.png and diff.png
// (differing pixels in magenta, the rest dimmed) in DIR/<case>/ (--keep: every frame's ref.png and ours.png). The
// parse cases compare JSON, from each file's bytes and from its text. --golden COMMIT: instead, the GUI draws
// tests/frames.js's frames into tests/golden.json, COMMIT naming the ScarletNX it was built from, each one checked
// against builder.js too.
"use strict";
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");
const { execFileSync } = require("child_process");

const args = process.argv.slice(2);
function opt(name, fallback) {
    const i = args.indexOf(name);
    return i >= 0 ? args[i + 1] : fallback;
}
const HERE = __dirname;
const REF_DIR = opt("--ref");
const SITE = path.resolve(opt("--site", path.join(HERE, "..", "..")));
const CHECKOUT = opt("--checkout");
const OUT = opt("--out");
const ONLY = opt("--only", "");
if (!REF_DIR || !CHECKOUT || !OUT) {
    console.error("usage: compare.js --ref REF_DIR --checkout CHECKOUT --out DIR [--only TEXT] " +
                  "[--render-only | --parse-only] [--keep] [--golden COMMIT] [--site SITE]");
    process.exit(2);
}
const REF = path.join(REF_DIR, "gui-ref"), REF_PHONE = path.join(REF_DIR, "gui-ref-phone");
const T = require(path.join(SITE, "theme/builder.js"));
fs.mkdirSync(OUT, { recursive: true });

// ---- images ----

function readPpm(file) {
    const b = fs.readFileSync(file);
    const head = b.toString("latin1", 0, 64).split(/\s+/);
    if (head[0] !== "P6") throw new Error(file + ": not a P6 PPM");
    const w = Number(head[1]), h = Number(head[2]);
    // the header ends after the third number's single white space
    let at = 0, fields = 0;
    while (fields < 4) {
        while (/\s/.test(String.fromCharCode(b[at]))) ++at;
        while (!/\s/.test(String.fromCharCode(b[at]))) ++at;
        ++fields;
    }
    return { w, h, rgb: b.subarray(at + 1, at + 1 + w * h * 3) };
}
function png(file, w, h, rgb) {
    const raw = Buffer.alloc((w * 3 + 1) * h);
    for (let y = 0; y < h; ++y) {
        raw[y * (w * 3 + 1)] = 0;
        rgb.copy ? rgb.copy(raw, y * (w * 3 + 1) + 1, y * w * 3, (y + 1) * w * 3)
            : raw.set(rgb.subarray(y * w * 3, (y + 1) * w * 3), y * (w * 3 + 1) + 1);
    }
    function chunk(type, data) {
        const len = Buffer.alloc(4), crc = Buffer.alloc(4), td = Buffer.concat([Buffer.from(type, "latin1"), data]);
        len.writeUInt32BE(data.length);
        crc.writeUInt32BE(zlib.crc32(td) >>> 0);
        return Buffer.concat([len, td, crc]);
    }
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(w, 0);
    ihdr.writeUInt32BE(h, 4);
    ihdr[8] = 8; ihdr[9] = 2;
    fs.writeFileSync(file, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr),
                                          chunk("IDAT", zlib.deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]));
}

// ---- the cases ----

const THEMES = {
    default: path.join(CHECKOUT, "src/gui/themes/default/theme.ini"),
    yorha: path.join(CHECKOUT, "src/gui/themes/yorha/theme.ini"),
    console: path.join(SITE, "tests/themes/console-bars.ini"),
    left: path.join(SITE, "tests/themes/steps-left-slide.ini"),
    near: path.join(SITE, "tests/themes/steps-near-fade.ini"),
    async: path.join(SITE, "tests/themes/steps-async-eret.ini")
};
const KEYS_THERE = path.join(OUT, "prod.keys"); // a file that exists, for "Keys already setup"
fs.writeFileSync(KEYS_THERE, "");
const KEYS_NONE = "/nonexistent/.switch/prod.keys";

// clocks: blink_ms 500 shows blinking things on even half seconds; dots turn every 400; the steps come at RUN's ms
function cases() {
    const out = [];
    function add(theme, view, clock, extra) {
        extra = extra || {};
        const name = [theme, view, clock].concat(extra.tag ? [extra.tag] : []).join("-");
        out.push(Object.assign({ name, theme, view, clock }, extra));
    }
    Object.keys(THEMES).forEach(function (th) {
        add(th, "menu", 1000);                    // blink on
        add(th, "menu", 1700);                    // blink off
        add(th, "load", 1000);
        add(th, "games", 1000);
        add(th, "keys", 1000, { keys: KEYS_NONE, tag: "none" });   // the drop line shown
        add(th, "keys", 1600, { keys: KEYS_THERE, tag: "there" }); // hidden when it blinks
        add(th, "run", 1450);                     // a line mid-way in (slide, fade, typing)
        add(th, "run", 2700);                     // mid-recompile, cursor on
        add(th, "run", 3600);                     // cursor off
        add(th, "run", 5333);                     // the last block, typing
        add(th, "run", 6550);                     // after the banner
        add(th, "run", 8000);
        add(th, "ended", 9800);                   // prompt off when it blinks
        add(th, "ended", 10000);                  // on
        add(th, "failed", 10000);
        add(th, "failed", 10700);
        add(th, "ask", 3000);                     // the recompile's question
        add(th, "ask", 7000);                     // the run's
        add(th, "aborting", 4000);
        add(th, "aborting", 4500);
        // the fades: the menu fading in, fading out as a run starts, the run fading in, a run fading out on ESC
        add(th, "menu", 1100, { env: { REF_FADE_MS: 1000 }, tag: "fadein" });
        add(th, "run", 2600, { env: { REF_ENTER_MS: 2400 }, tag: "entering" });
        add(th, "run", 2750, { env: { REF_FADE_MS: 2600 }, tag: "runfade" });
        add(th, "ended", 9900, { env: { REF_LEAVE_MS: 9700 }, tag: "leaving" });
        // the long description, sliding when scroll_ms says so
        add(th, "menu", 3000, { env: { REF_SELECTED: 11 }, tag: "log" });
        add(th, "menu", 6100, { env: { REF_SELECTED: 11 }, tag: "log" });
    });
    // the preview's 1x: a 640x400 window, 80 x 25 at scale 1
    Object.keys(THEMES).forEach(function (th) {
        [["menu", 1000], ["load", 1000], ["games", 1000], ["keys", 1000], ["run", 1450], ["run", 2700],
         ["run", 6550], ["ended", 10000], ["failed", 10700], ["ask", 7000], ["aborting", 4000]].forEach(function (v) {
            add(th, v[0], v[1], { env: { REF_SIZE: "640x400" }, tag: "1x" });
        });
        add(th, "run", 2750, { env: { REF_SIZE: "640x400", REF_FADE_MS: 2600 }, tag: "1x-runfade" });
    });
    // the live preview's loop (loopState): frames along it and in the middle of each fade, gui-ref drawing the state
    // the loop gives
    Object.keys(THEMES).forEach(function (th) {
        const t = T.parse(fs.readFileSync(THEMES[th]), "ref"), len = T.loopLength(t), L = T.LOOP;
        const moments = [];
        for (let k = 0; k < 24; ++k) moments.push(Math.floor(k * len / 24) + 7);
        moments.push(Math.floor(t.fade_in_ms / 2), L.menu + Math.floor(t.fade_out_ms / 2),
                     L.menu + t.fade_out_ms + Math.floor(t.fade_in_ms / 2),
                     L.menu + T.RUN_END + L.ended + Math.floor(t.fade_out_ms / 2));
        moments.forEach(function (ms) {
            const l = T.loopState(t, ms, false), s = l.state;
            add(th, s.view, l.now, { tag: "loop" + ms, env: { REF_FADE_MS: s.fadeMs, REF_ENTER_MS: s.enteringMs,
                                     REF_LEAVE_MS: s.leavingMs, REF_RUN_AT: s.runAt, REF_SELECTED: s.selected } });
        });
    });
    // the long titles of steps-left-slide slide the name: a few clocks along the way
    [8100, 8650, 9300, 11900].forEach(function (c) { add("left", "run", c, { tag: "scroll" }); });
    // a phone's words and folders (gui-ref-phone), at 2x and 1x
    ["default", "yorha", "console", "left"].forEach(function (th) {
        [["menu", 1000], ["load", 1000], ["games", 1000], ["keys", 1000], ["run", 2700], ["run", 6550],
         ["ended", 10000], ["failed", 10700], ["ask", 7000], ["aborting", 4000]].forEach(function (v) {
            add(th, v[0], v[1], { phone: true, tag: "phone" });
            add(th, v[0], v[1], { phone: true, env: { REF_SIZE: "640x400" }, tag: "phone-1x" });
        });
        add(th, "menu", 3000, { phone: true, env: { REF_SELECTED: 11 }, tag: "phone-log" });
        add(th, "menu", 3000, { phone: true, env: { REF_SELECTED: 4 }, tag: "phone-fullscreen" });
    });
    // the splash: the icon on each theme's splash page, stretched at 2x, as it is at 1x
    Object.keys(THEMES).forEach(function (th) {
        add(th, "splash", 1000);
        add(th, "splash", 1000, { env: { REF_SIZE: "640x400" }, tag: "1x" });
    });
    return out.filter(function (c) { return !ONLY || c.name.indexOf(ONLY) >= 0; });
}

function builderState(c, t) {
    const s = T.sampleState(c.view, !!c.phone);
    // gui-ref's keys path, its own default when the case names none; the warning shows when that file exists
    s.keysPath = c.keys || s.say.home + "/.switch/prod.keys";
    s.keysThere = fs.existsSync(s.keysPath);
    const env = c.env || {};
    if (env.REF_FADE_MS) s.fadeMs = env.REF_FADE_MS;
    if (env.REF_ENTER_MS) s.enteringMs = env.REF_ENTER_MS;
    if (env.REF_LEAVE_MS) s.leavingMs = env.REF_LEAVE_MS;
    if (env.REF_SELECTED !== undefined) s.selected = env.REF_SELECTED;
    if (env.REF_SIZE === "640x400") s.scale = 1;
    if (env.REF_RUN_AT) s.runAt = env.REF_RUN_AT;
    return s;
}

function renderCase(c) {
    const dir = path.join(OUT, c.name);
    const ppm = path.join(OUT, c.name + ".ppm");
    const env = Object.assign({}, process.env);
    Object.keys(c.env || {}).forEach(function (k) { env[k] = String(c.env[k]); });
    execFileSync(c.phone ? REF_PHONE : REF, ["render", THEMES[c.theme], c.view, String(c.clock), ppm]
                     .concat(c.keys ? [c.keys] : []), { env, stdio: ["ignore", "ignore", "inherit"] });
    const ref = readPpm(ppm);
    fs.unlinkSync(ppm);
    const t = T.parse(fs.readFileSync(THEMES[c.theme]), "ref");
    const surface = new T.Surface(ref.w, ref.h);
    const info = T.render(surface, t, builderState(c, t), c.clock);
    let differ = 0, ring = 0, near = 0, worst = 0;
    const diff = Buffer.alloc(ref.w * ref.h * 3), ours = Buffer.alloc(ref.w * ref.h * 3);
    for (let y = 0; y < ref.h; ++y)
        for (let x = 0; x < ref.w; ++x) {
            const i = y * ref.w + x;
            let d = 0;
            for (let k = 0; k < 3; ++k) {
                ours[i * 3 + k] = surface.px[i * 4 + k];
                d = Math.max(d, Math.abs(surface.px[i * 4 + k] - ref.rgb[i * 3 + k]));
            }
            for (let k = 0; k < 3; ++k) diff[i * 3 + k] = ref.rgb[i * 3 + k] / 3;
            if (!d) continue;
            const inRing = info.ring && x >= info.ring.x0 && x <= info.ring.x1 && y >= info.ring.y0 && y <= info.ring.y1;
            if (inRing) ++ring;
            else if (info.partial && d <= 2) ++near;
            else {
                ++differ;
                worst = Math.max(worst, d);
                diff[i * 3] = 255; diff[i * 3 + 1] = 0; diff[i * 3 + 2] = 255;
            }
        }
    const result = { name: c.name, differ, ring, near, worst, partial: info.partial, pass: differ === 0 };
    if (!result.pass || args.indexOf("--keep") >= 0) {
        fs.mkdirSync(dir, { recursive: true });
        png(path.join(dir, "ref.png"), ref.w, ref.h, ref.rgb);
        png(path.join(dir, "ours.png"), ref.w, ref.h, ours);
        if (!result.pass) png(path.join(dir, "diff.png"), ref.w, ref.h, diff);
    }
    return result;
}

// ---- the parsers ----

function parseCases() {
    const dir = path.join(HERE, "parse-corpus");
    const out = [];
    fs.readdirSync(dir).filter(function (n) { return n.endsWith(".ini"); }).sort().forEach(function (n) {
        out.push({ file: path.join(dir, n), id: "corpus" });
    });
    // the folder's name: the theme's id and name while it fits their 64 bytes, else the base's stay
    ["x".repeat(63), "x".repeat(64), "\u00e9".repeat(31), "\u00e9".repeat(32), ""].forEach(function (id) {
        out.push({ file: path.join(dir, "01-plain.ini"), id });
    });
    return out.filter(function (c) { return !ONLY || path.basename(c.file).indexOf(ONLY) >= 0; });
}
function parseCase(c) {
    const decoder = new TextDecoder("utf-8", { ignoreBOM: true });
    const ref = JSON.parse(decoder.decode(execFileSync(REF, ["parse", c.file, c.id])));
    const bytes = fs.readFileSync(c.file);
    const fromBytes = T.parse(bytes, c.id);
    const fromText = T.parse(decoder.decode(bytes), c.id);
    const a = JSON.stringify(ref), b = JSON.stringify(fromBytes), t = JSON.stringify(fromText);
    // a file with a broken UTF-8 sequence cannot be the same as text: the text holds U+FFFD in its place
    const broken = decoder.decode(bytes).indexOf("\ufffd") >= 0;
    return { name: path.basename(c.file) + (c.id === "corpus" ? "" : " id=" + JSON.stringify(c.id).slice(0, 24)),
             bytes: a === b, text: broken ? null : a === t, ref: a, ours: b };
}

// ---- the site's golden frames ----

if (opt("--golden")) {
    const F = require(path.resolve(SITE, "tests/frames.js"));
    const crypto = require("crypto");
    const frames = {};
    let bad = 0;
    F.cases().forEach(function (c) {
        const ppm = path.join(OUT, "golden.ppm");
        const file = F.themeFile(c.theme) || path.join(CHECKOUT, "src/gui/themes", F.THEMES[c.theme].builtin, "theme.ini");
        const env = Object.assign({}, process.env, c.scale === 1 ? { REF_SIZE: "640x400" } : {});
        execFileSync(c.phone ? REF_PHONE : REF, ["render", file, c.view, String(c.clock), ppm],
                     { env, stdio: ["ignore", "ignore", "inherit"] });
        const ref = readPpm(ppm);
        fs.unlinkSync(ppm);
        frames[c.name] = crypto.createHash("sha256").update(ref.rgb).digest("hex");
        const ours = F.hash(F.draw(T, c).px);
        if (ours !== frames[c.name]) ++bad;
        console.log((ours === frames[c.name] ? "PASS " : "FAIL ") + c.name);
    });
    fs.writeFileSync(path.resolve(SITE, "tests/golden.json"), JSON.stringify({
        gui: "ScarletNX " + opt("--golden") + ": src/gui/main.c on SDL's software renderer (gui-ref)",
        frames
    }, null, 1) + "\n");
    console.log(bad ? bad + " frames builder.js draws otherwise" : "golden.json written, builder.js draws every frame alike");
    process.exit(bad ? 1 : 0);
}

// ---- the run ----

let failed = 0;
const lines = [];
function report(s) { lines.push(s); console.log(s); }
if (args.indexOf("--parse-only") < 0) {
    report("render: case | differing px (outside the ring, past the alpha tolerance) | in ring box | within 2 on an " +
           "alpha frame | worst channel");
    cases().forEach(function (c) {
        const r = renderCase(c);
        if (!r.pass) ++failed;
        report((r.pass ? "PASS " : "FAIL ") + r.name + " | " + r.differ + " | " + r.ring + " | " + r.near + " | " + r.worst);
    });
}
if (args.indexOf("--render-only") < 0) {
    report("parse: file | bytes equal | text equal");
    parseCases().forEach(function (c) {
        const r = parseCase(c);
        const pass = r.bytes && r.text !== false;
        if (!pass) {
            ++failed;
            report("  ref:  " + r.ref);
            report("  ours: " + r.ours);
        }
        report((pass ? "PASS " : "FAIL ") + r.name + " | " + r.bytes + " | " + (r.text === null ? "n/a (broken UTF-8)" : r.text));
    });
}
report(failed ? failed + " FAILED" : "all passed");
fs.writeFileSync(path.join(OUT, "results.txt"), lines.join("\n") + "\n");
process.exit(failed ? 1 : 0);
