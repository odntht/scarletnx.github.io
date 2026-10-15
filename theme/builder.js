// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright 2026 the ScarletNX contributors
//
// The theme builder: ScarletNX's GUI themes (a theme.ini, format 1) read, written and drawn as the GUI draws them.
// It follows ScarletNX's src/gui/theme.c (how a file is read), src/gui/main.c (how the screens are drawn, on SDL's
// software renderer), src/gui/steps.c (how a run's output becomes the loading screen's steps) and src/gui/model.c
// (the console, the sliding lines): a change there wants the same change here. docs/GUI.md describes the keys.
(function () {
    "use strict";
    var fontData = typeof SNX_FONT !== "undefined" ? { SNX_FONT: SNX_FONT, SNX_CODEPAGE: SNX_CODEPAGE }
        : require("./font.js");
    var FONT = (function (b64) {
        var raw = typeof atob === "function" ? atob(b64) : Buffer.from(b64, "base64").toString("binary");
        var out = new Uint8Array(raw.length);
        for (var i = 0; i < raw.length; ++i) out[i] = raw.charCodeAt(i);
        return out;
    })(fontData.SNX_FONT);
    var CODEPAGE = fontData.SNX_CODEPAGE;
    // the program's icon for the splash (icon.js), decoded by loadIcon
    var iconPng = typeof SNX_ICON_PNG !== "undefined" ? SNX_ICON_PNG
        : typeof module !== "undefined" ? require("./icon.js").SNX_ICON_PNG : null;
    // the GUI computes in float: every step of its arithmetic rounds to one here
    var f = Math.fround;

    // ---- text: UTF-8 bytes as the GUI keeps them, and the font's glyphs ----

    var ENCODER = new TextEncoder();
    // ignoreBOM keeps a byte order mark: the GUI reads it as three bytes of the first line
    var DECODER = new TextDecoder("utf-8", { ignoreBOM: true });
    function codepoints(s) {
        var out = [];
        for (var i = 0; i < s.length;) {
            var c = s.codePointAt(i);
            out.push(c);
            i += c > 0xFFFF ? 2 : 1;
        }
        return out;
    }
    function utf8Length(s) { return ENCODER.encode(s).length; }
    // the bytes of a text or a file, as one character each (0 to 255): theme.c reads bytes
    function binary(input) {
        var bytes = typeof input === "string" ? ENCODER.encode(input)
            : input instanceof ArrayBuffer ? new Uint8Array(input) : input;
        var out = "";
        for (var i = 0; i < bytes.length; i += 8192)
            out += String.fromCharCode.apply(null, Array.prototype.slice.call(bytes.subarray(i, i + 8192)));
        return out;
    }
    // bytes back to text; a broken sequence becomes U+FFFD, which the font draws as '?' as the GUI does
    function text(bin) {
        var bytes = new Uint8Array(bin.length);
        for (var i = 0; i < bin.length; ++i) bytes[i] = bin.charCodeAt(i);
        return DECODER.decode(bytes);
    }
    // the first max bytes of s, as snprintf or memcpy cut them
    function cutBytes(s, max) {
        var bytes = ENCODER.encode(s);
        return bytes.length <= max ? s : DECODER.decode(bytes.subarray(0, max));
    }
    // the font is CP437: a character outside it shows as '?' (gui_glyph)
    function glyph(c) {
        if (c < 128) return c;
        var i = CODEPAGE.indexOf(c);
        return i < 0 ? 63 : 128 + i;
    }
    // the characters of s the font lacks, once each
    function undrawable(s) {
        var out = [];
        codepoints(s).forEach(function (c) {
            var ch = String.fromCodePoint(c);
            if (c >= 128 && CODEPAGE.indexOf(c) < 0 && out.indexOf(ch) < 0) out.push(ch);
        });
        return out;
    }
    function drawable(s) { return !undrawable(s).length; }
    function upper(s) { return s.replace(/[a-z]/g, function (c) { return c.toUpperCase(); }); }

    // ---- themes: the built-ins and theme.ini, as theme.c has them ----

    var SCREENS = ["menu", "games", "keys", "compiling", "loading"];
    function blank() {
        return {
            id: "", name: "", author: "", format: 0,
            colors: { page: "#000000", ink: "#000000", soft: "#000000", focus: "#000000", active: "#000000",
                      failure: "#000000", dim: "#000000", warning: "#000000" },
            head: "plain", head_rule: false, footer: "plain", footer_rule: false,
            title: { menu: "", games: "", keys: "", compiling: "", loading: "" },
            marker: "", focus_bar: false,
            run: "console",
            run_colors: { page: "#000000", ink: "#000000", soft: "#000000", dim: "#000000", failure: "#000000",
                          warning: "#000000" },
            texture: false, bar: false, detailed: false, collapse: false, ring: "none",
            prompt: { align: "left", open: "", close: "", blink: false,
                      lines: { keys: false, done: false, failed: false, aborting: false } },
            line_in: "none", typing_sync: false,
            fade_in_ms: 0, fade_out_ms: 0, line_in_ms: 0, typing_ms: 0, blink_ms: 0, scroll_ms: 0,
            splash: { page: "#000000", ms: 0, chance: 0 }
        };
    }
    function clone(t) { return JSON.parse(JSON.stringify(t)); }
    // The built-ins: ScarletNX's src/gui/themes/<id>/theme.ini, each read over nothing (theme.c's builtins_read), its
    // file setting every key. The page's own copies (themes.js) until setThemes is given main's
    var BUILTINS = {}, BUILTIN_TEXTS = {};
    function setThemes(texts) {
        var ids = Object.keys(texts).filter(function (id) { return id !== "default"; }).sort();
        if (Object.prototype.hasOwnProperty.call(texts, "default")) ids.unshift("default");
        Object.keys(BUILTINS).forEach(function (id) { delete BUILTINS[id]; delete BUILTIN_TEXTS[id]; });
        ids.forEach(function (id) {
            var t = blank();
            t.id = id;
            entries(binary(texts[id])).forEach(function (e) { apply(t, e[0], e[1], e[2], false); });
            BUILTINS[id] = t;
            BUILTIN_TEXTS[id] = texts[id];
        });
        return ids;
    }
    function themeIds() { return Object.keys(BUILTINS); }
    function builtin(id) { return Object.prototype.hasOwnProperty.call(BUILTINS, id) ? clone(BUILTINS[id]) : null; }

    // The reading of one value (bytes), null when it cannot be read: the base's value stays
    function colour(value) { return /^#[0-9A-Fa-f]{6}$/.test(value) ? value.toUpperCase() : null; }
    function flag(value) { return value === "true" ? true : value === "false" ? false : null; }
    // strtoul in base 10, then 0 to 10000: leading white space and a sign, a negative number wrapping round 2^64
    function integer(value) {
        var m = /^[ \t\n\v\f\r]*([+-]?)([0-9]+)$/.exec(value);
        if (!m) return null;
        var n = BigInt(m[2]), wrap = BigInt("18446744073709551616");
        if (n >= wrap) return null; // out of range: ULONG_MAX
        if (m[1] === "-" && n) n = wrap - n;
        return n > BigInt(10000) ? null : Number(n);
    }
    function word(value, words) { return words.indexOf(value) >= 0 ? value : null; }
    // a string key: its bytes must fit the GUI's field, NUL included
    function string(value, size) { return value.length < size ? text(value) : null; }

    var PALETTE = ["page", "ink", "soft", "dim", "failure", "warning"];
    function palette(p, key, value) {
        var c;
        if (PALETTE.indexOf(key) >= 0 && (c = colour(value))) p[key] = c;
    }
    // one key of the file over the theme (theme.c's apply); runColors: an ErET loading theme's [colors]
    function apply(t, section, key, value, runColors) {
        var v;
        if (section === "theme" && key === "name") { if ((v = string(value, 64)) !== null) t.name = v; }
        else if (section === "theme" && key === "author") { if ((v = string(value, 64)) !== null) t.author = v; }
        else if (section === "theme" && key === "format") { v = integer(value); if (v) t.format = v; }
        else if (section === "colors" && runColors) {
            if (key === "texture" && (v = flag(value)) !== null) t.texture = v;
            palette(t.run_colors, key, value);
        } else if (section === "colors") {
            if (key === "texture" && (v = flag(value)) !== null) t.texture = v; // where ErET keeps it
            if (Object.prototype.hasOwnProperty.call(t.colors, key) && (v = colour(value))) t.colors[key] = v;
        } else if (section === "head" || section === "footer") {
            var head = section === "head";
            if (key === "style") { if ((v = word(value, ["plain", "bar", "none"]))) t[head ? "head" : "footer"] = v; }
            else if (key === "rule") { if ((v = flag(value)) !== null) t[head ? "head_rule" : "footer_rule"] = v; }
            else if (head && SCREENS.indexOf(key) >= 0 && (v = string(value, 64)) !== null) t.title[key] = v;
        } else if (section === "body") {
            if (key === "marker") { if ((v = string(value, 16)) !== null) t.marker = v; }
            else if (key === "focus" && (value === "bar" || value === "color")) t.focus_bar = value === "bar";
        } else if (section === "run") {
            if (key === "layout") { if ((v = word(value, ["console", "steps"]))) t.run = v; }
            else if (key === "ring") { if ((v = word(value, ["none", "left", "right", "right-near-text"]))) t.ring = v; }
            else if (key === "texture") { if ((v = flag(value)) !== null) t.texture = v; }
            else if (key === "bar") { if ((v = flag(value)) !== null) t.bar = v; }
            else if (key === "detailed") { if ((v = flag(value)) !== null) t.detailed = v; }
            else if (key === "collapse") { if ((v = flag(value)) !== null) t.collapse = v; }
            else palette(t.run_colors, key, value);
        } else if (section === "transitions") {
            var ms = ["fade_in_ms", "fade_out_ms", "line_in_ms", "typing_ms", "blink_ms", "scroll_ms"];
            if (key === "line_in") { if ((v = word(value, ["none", "typing", "slide", "fade"]))) t.line_in = v; }
            else if (ms.indexOf(key) >= 0) { if ((v = integer(value)) !== null) t[key] = v; }
            else if (key === "typing" && (value === "async" || value === "sync")) t.typing_sync = value === "sync";
        } else if (section === "splash") {
            if (key === "page") { if ((v = colour(value))) t.splash.page = v; }
            else if (key === "ms") { if ((v = integer(value)) !== null) t.splash.ms = v; }
            else if (key === "chance" && (v = integer(value)) !== null) t.splash.chance = Math.min(v, 100);
        } else if (section === "header" && key === "ring_side") {
            // ErET's words; none is ours
            if ((v = word(value, ["right", "left", "right-near-text"]))) t.ring = v;
        } else if (section === "prompt") {
            if (key === "align") { if ((v = word(value, ["left", "center", "right"]))) t.prompt.align = v; }
            else if (key === "open") { if ((v = string(value, 16)) !== null) t.prompt.open = v; }
            else if (key === "close") { if ((v = string(value, 16)) !== null) t.prompt.close = v; }
            else if (key === "blink") { if ((v = flag(value)) !== null) t.prompt.blink = v; }
            else if (["keys", "done", "failed", "aborting"].indexOf(key) >= 0 && (v = flag(value)) !== null)
                t.prompt.lines[key] = v;
        } else if (section === "loading" && key === "title") {
            if ((v = string(value, 64)) !== null) t.title.loading = v; // ErET's boot word
        }
    }
    // each key line of a file's bytes as [section, key, value] (bytes), as theme.c's visit reads them: up to a NUL,
    // a line to a '\n', ' ' and '\t' trimmed before and '\r' too after, a section's name under 32 bytes
    function entries(bin) {
        var out = [], section = "";
        bin.split("\0")[0].split("\n").forEach(function (line) {
            var s = line.replace(/^[ \t]+/, "").replace(/[ \t\r]+$/, "");
            if (!s || s[0] === ";" || s[0] === "#") return;
            if (s[0] === "[") {
                var end = s.indexOf("]");
                section = end >= 0 && end - 1 < 32 ? s.slice(1, end) : "";
                return;
            }
            var eq = s.indexOf("=");
            if (eq < 0) return;
            var key = s.slice(0, eq).replace(/^[ \t]+/, "").replace(/[ \t\r]+$/, "");
            var value = s.slice(eq + 1).replace(/^[ \t]+/, "").replace(/[ \t\r]+$/, "");
            if (value.length >= 2 && value[0] === '"' && value[value.length - 1] === '"') value = value.slice(1, -1);
            out.push([section, key, value]);
        });
        return out;
    }
    function layoutBase(layout) {
        if (layout === "menu" || layout === "loading") return "yorha";
        if (layout === "plain" || layout === "debug" || layout === "skip") return "default";
        return null;
    }
    // A theme.ini (text, or a file's bytes) over the built-in it names, as gui_theme_parse reads it; id is the
    // folder's name, the theme's name until the file gives one
    function parse(input, id) {
        var list = entries(binary(input)), base = null, eretBase = null, eretLoading = false;
        list.forEach(function (e) {
            if (e[0] !== "theme") return;
            if (e[1] === "base" && builtin(e[2])) base = e[2];
            else if (e[1] === "layout" && layoutBase(e[2])) {
                eretBase = layoutBase(e[2]);
                eretLoading = e[2] === "loading";
            }
        });
        var t = builtin(base || eretBase || "default");
        id = id || "";
        if (utf8Length(id) < 64) t.id = t.name = id;
        list.forEach(function (e) { apply(t, e[0], e[1], e[2], !base && eretLoading); });
        return t;
    }
    // every key this GUI reads, by section; ErET's that it reads too are marked by eret below
    var KNOWN = {
        theme: ["format", "name", "author", "layout", "base"],
        colors: ["page", "ink", "soft", "focus", "active", "failure", "dim", "warning", "texture"],
        head: ["style", "rule"].concat(SCREENS), body: ["marker", "focus"], footer: ["style", "rule"],
        run: ["layout", "page", "ink", "soft", "dim", "failure", "warning", "texture", "bar", "detailed", "collapse",
              "ring"],
        prompt: ["align", "open", "close", "blink", "keys", "done", "failed", "aborting"],
        transitions: ["fade_in_ms", "fade_out_ms", "line_in", "line_in_ms", "typing_ms", "typing", "blink_ms",
                      "scroll_ms"],
        splash: ["page", "ms", "chance"], header: ["ring_side"], loading: ["title"]
    };
    function known(section, key) {
        return Object.prototype.hasOwnProperty.call(KNOWN, section) && KNOWN[section].indexOf(key) >= 0;
    }
    // What a file says beyond the theme, for it to be written back: its [theme] base and ErET's layout, whether it
    // has ErET's own places for the ring, the boot word and the texture (written again, with the theme's values),
    // and the keys this GUI does not read, kept for the programs that do ([section, key, value], in order)
    function fileKeys(input) {
        var keys = { base: null, layout: null, eret: { ring_side: false, title: false, texture: false }, others: [] };
        entries(binary(input)).forEach(function (e) {
            var section = text(e[0]), key = text(e[1]), value = text(e[2]);
            if (section === "theme" && (key === "base" || key === "layout")) keys[key] = value;
            if (section === "header" && key === "ring_side") keys.eret.ring_side = true;
            if (section === "loading" && key === "title") keys.eret.title = true;
            if (section === "colors" && key === "texture") keys.eret.texture = true;
            if (section && key && !known(section, key)) keys.others.push([section, key, value]);
        });
        return keys;
    }

    // ---- writing: every key, so the file reads the same over any base ----

    // ---- formats: what [theme] format = N promises (README.md, "Theme formats") ----

    // the format this builder writes, the GUI's GUI_THEME_FORMAT
    var FORMAT = 1;
    // CONVERT[n]: a format n file's text as format n + 1 says the same, for the keys whose meaning changed. None yet:
    // the first change of format adds one, and ScarletNX's tests/gui_themes/<n> still read the same through it
    var CONVERT = {};
    function formatOf(input) { return parse(input, "").format; }
    // an older format's file in the newest one this builder writes; a newer one as it is
    function upgrade(text) {
        var n = formatOf(text);
        while (n < FORMAT && CONVERT[n]) text = CONVERT[n++](text);
        return text;
    }

    // quotes keep white space at either end, and a value that is itself quoted
    function quote(v) {
        return /^[ \t]|[ \t\r]$/.test(v) || (v.length >= 2 && v[0] === '"' && v[v.length - 1] === '"') ? '"' + v + '"' : v;
    }
    function onOff(b) { return b ? "true" : "false"; }
    var LAYOUTS = ["plain", "debug", "loading", "menu", "skip"];
    function serialize(t, opts) {
        opts = opts || {};
        var base = builtin(opts.base) ? opts.base : "default";
        var own = BUILTIN_TEXTS[base] ? fileKeys(BUILTIN_TEXTS[base]).layout : null;
        var layout = LAYOUTS.indexOf(opts.layout) >= 0 ? opts.layout : LAYOUTS.indexOf(own) >= 0 ? own : "debug";
        // ErET's loading layout names no base: it starts from YoRHa, the menus keep YoRHa's colours and [colors] are
        // the loading screen's, as both programs read it
        var loading = layout === "loading";
        var L = [];
        function line(s) { L.push(s); }
        function kv(k, v) { line(k + " = " + v); }
        line("; ScarletNX GUI theme, format 1: a folder of themes/ holding this file, the folder's name its id. A folder named");
        line("; like a built-in replaces it. Keys left out, or that cannot be read, keep the base's value; keys this GUI does not");
        line("; know are left for others (rEden's ErET reads the same file). A comment takes a line of its own. docs/GUI.md");
        line("; describes every key. Made with https://scarletnx.github.io/theme/");
        line("[theme]");
        // a newer format's file keeps its number: the keys of it this builder does not know are kept as they are
        kv("format", String(Math.max(t.format || FORMAT, FORMAT)));
        kv("name", quote(t.name));
        kv("author", quote(t.author));
        line("; ErET's drawing for it (plain | debug | loading | menu | skip); a base when no base names one");
        kv("layout", layout);
        if (loading) line("; no base: ErET's loading layout starts from yorha, the menus in its colours");
        else {
            line("; the built-in it starts from: default | yorha, or another folder of ScarletNX's src/gui/themes");
            kv("base", base);
        }
        line("");
        line("[colors]");
        if (loading) {
            line("; the loading screen's (a run's), #RRGGBB, as [run] has them in other layouts");
            PALETTE.forEach(function (k) { kv(k, t.run_colors[k]); });
            kv("texture", onOff(t.texture));
        } else {
            line("; the menus, #RRGGBB. soft: hints and secondary text; focus: the focused line, or its band; dim: rules");
            ["page", "ink", "soft", "focus", "active", "failure", "dim", "warning"].forEach(function (k) {
                kv(k, t.colors[k]);
            });
        }
        line("");
        line("[head]");
        line("; plain | bar | none; rule: a line under the head");
        kv("style", t.head);
        kv("rule", onOff(t.head_rule));
        line("; the title of each screen, empty for none; a steps run's title word");
        SCREENS.forEach(function (k) { kv(k, quote(t.title[k])); });
        line("");
        line("[body]");
        line("; before each menu item; quotes keep spaces");
        kv("marker", '"' + t.marker + '"');
        line("; the focused line: color | bar");
        kv("focus", t.focus_bar ? "bar" : "color");
        line("");
        line("[footer]");
        line("; plain | bar | none; rule: a line over the footer");
        kv("style", t.footer);
        kv("rule", onOff(t.footer_rule));
        line("");
        line("[run]");
        line("; console: the driver's output as it comes; steps: a loading screen, in the colours below");
        kv("layout", t.run);
        if (!loading) {
            PALETTE.slice(0, 5).forEach(function (k) { kv(k, t.run_colors[k]); });
            line("; a run being aborted");
            kv("warning", t.run_colors.warning);
        }
        line("; faint lines over the page; the progress bar and its percentage");
        kv("texture", onOff(t.texture));
        kv("bar", onOff(t.bar));
        line("; detailed: each step's other lines under it; collapse: a done step's folded away, a failed one's kept");
        kv("detailed", onOff(t.detailed));
        kv("collapse", onOff(t.collapse));
        line("; none | left | right | right-near-text");
        kv("ring", t.ring);
        line("");
        line("[prompt]");
        line("; a line that waits on the user, when its key below is true: framed by open and close, placed left | center |");
        line("; right on its row, blinking at blink_ms (blink = false: steady). False keeps the line plain, at the left");
        kv("align", t.prompt.align);
        kv("open", '"' + t.prompt.open + '"');
        kv("close", '"' + t.prompt.close + '"');
        kv("blink", onOff(t.prompt.blink));
        line("; keys: the keys screen's drop line; done and failed: the ESC line after a run; aborting: a run being aborted");
        ["keys", "done", "failed", "aborting"].forEach(function (k) { kv(k, onOff(t.prompt.lines[k])); });
        line("");
        line("[transitions]");
        line("; milliseconds, 0 to 10000; 0 turns the thing off. fade_out_ms: the menu as a run starts, and a run ESC");
        line("; leaves; fade_in_ms: what comes after");
        kv("fade_in_ms", String(t.fade_in_ms));
        kv("fade_out_ms", String(t.fade_out_ms));
        line("; how a step's line comes in: none | typing | slide | fade");
        kv("line_in", t.line_in);
        kv("line_in_ms", String(t.line_in_ms));
        kv("typing_ms", String(t.typing_ms));
        line("; async: every line types from when it comes; sync: one at a time. A running step's newest line");
        line("; types a character each typing_ms, any other line whole in typing_ms");
        kv("typing", t.typing_sync ? "sync" : "async");
        kv("blink_ms", String(t.blink_ms));
        line("; a line too long for its row (big letters) slides left a column every scroll_ms and back; 0 cuts it");
        kv("scroll_ms", String(t.scroll_ms));
        line("");
        line("[splash]");
        line("; the boot's: the program's icon on page for ms milliseconds (0: none). chance: the boots in 100 that");
        line("; show this theme's, the default theme's the others");
        kv("page", t.splash.page);
        kv("ms", String(t.splash.ms));
        kv("chance", String(t.splash.chance));
        // ErET's places for the same things, when the file had them: the same values, read after the GUI's own
        var eret = opts.eret || {};
        if (loading) eret = { ring_side: eret.ring_side, title: eret.title };
        if ((eret.ring_side && t.ring !== "none") || eret.title || eret.texture) {
            line("");
            line("; ErET's places for the ring, the boot word and the texture, the same as above");
            if (eret.ring_side && t.ring !== "none") { line("[header]"); kv("ring_side", t.ring); }
            if (eret.title) { line("[loading]"); kv("title", quote(t.title.loading)); }
            if (eret.texture) { line("[colors]"); kv("texture", onOff(t.texture)); }
        }
        var section = null;
        (opts.others || []).forEach(function (e, i) {
            if (!i) {
                line("");
                line("; keys this GUI does not read, kept for the programs that do");
            }
            if (e[0] !== section) line("[" + (section = e[0]) + "]");
            kv(e[1], quote(e[2]));
        });
        return L.join("\n") + "\n";
    }

    // ---- the form: every key, by section, with what the GUI takes ----

    function get(t, path) { return path.split(".").reduce(function (o, k) { return o[k]; }, t); }
    function set(t, path, v) {
        var keys = path.split("."), o = t;
        keys.slice(0, -1).forEach(function (k) { o = o[k]; });
        o[keys[keys.length - 1]] = v;
    }
    // type: text (bytes: the GUI's field, NUL included, so bytes - 1 at most), color, flag, choice (words; values
    // when the theme keeps them otherwise), ms (0 to 10000)
    var SCHEMA = [
        { section: "theme", about: "Who made it. The theme's id is its folder's name.", keys: [
            { key: "name", path: "name", type: "text", bytes: 64, about: "the name the menu's Theme item shows" },
            { key: "author", path: "author", type: "text", bytes: 64, about: "who made it" }] },
        { section: "colors", about: "The menus' colours.", keys: [
            { key: "page", path: "colors.page", type: "color", about: "the background" },
            { key: "ink", path: "colors.ink", type: "color", about: "text; the head's and footer's bar" },
            { key: "soft", path: "colors.soft", type: "color", about: "hints, secondary text, rules" },
            { key: "focus", path: "colors.focus", type: "color", about: "the focused line, or its band" },
            { key: "active", path: "colors.active", type: "color", about: "the item chosen, the run's head" },
            { key: "failure", path: "colors.failure", type: "color", about: "warnings, the ESC line, a failed run" },
            { key: "dim", path: "colors.dim", type: "color", about: "unused by the menus; [run] dim is the loading screen's" },
            { key: "warning", path: "colors.warning", type: "color", about: "the abort question in the console layout" }] },
        { section: "head", about: "The top: a title per screen and the hints under it.", keys: [
            { key: "style", path: "head", type: "choice", words: ["plain", "bar", "none"],
              about: "bar: the title on a band of ink; none: no title and no hints" },
            { key: "rule", path: "head_rule", type: "flag", about: "a line under the head" },
            { key: "menu", path: "title.menu", type: "text", bytes: 64, about: "the menu's title" },
            { key: "games", path: "title.games", type: "text", bytes: 64, about: "the games/ list's title" },
            { key: "keys", path: "title.keys", type: "text", bytes: 64, about: "the keys screen's title" },
            { key: "compiling", path: "title.compiling", type: "text", bytes: 64,
              about: "a run's title until the game loads" },
            { key: "loading", path: "title.loading", type: "text", bytes: 64,
              about: "a run's title once the runner's banner came" }] },
        { section: "body", about: "The menu's lines.", keys: [
            { key: "marker", path: "marker", type: "text", bytes: 16, about: "before each menu item" },
            { key: "focus", path: "focus_bar", type: "choice", words: ["color", "bar"], values: [false, true],
              about: "the focused line in the focus colour, or on a band of it" }] },
        { section: "footer", about: "The bottom: resource use and the working folder.", keys: [
            { key: "style", path: "footer", type: "choice", words: ["plain", "bar", "none"],
              about: "bar: on a band of ink" },
            { key: "rule", path: "footer_rule", type: "flag", about: "a line over the footer" }] },
        { section: "run", about: "A run: the driver's output as it comes, or a loading screen in its own colours.", keys: [
            { key: "layout", path: "run", type: "choice", words: ["console", "steps"],
              about: "steps: the loading screen; the keys below but colours are its" },
            { key: "page", path: "run_colors.page", type: "color", about: "the loading screen's background" },
            { key: "ink", path: "run_colors.ink", type: "color", about: "its text, the cursor, the ring's turning bar" },
            { key: "soft", path: "run_colors.soft", type: "color", about: "older steps, the name, the inner ring" },
            { key: "dim", path: "run_colors.dim", type: "color", about: "the outer ring, the bar's empty segments" },
            { key: "failure", path: "run_colors.failure", type: "color", about: "a failed step, a failed run" },
            { key: "warning", path: "run_colors.warning", type: "color", about: "a run being aborted, the question" },
            { key: "texture", path: "texture", type: "flag", about: "faint lines over the page" },
            { key: "bar", path: "bar", type: "flag", about: "the progress bar and its percentage" },
            { key: "detailed", path: "detailed", type: "flag", about: "each step's other lines under it" },
            { key: "collapse", path: "collapse", type: "flag", about: "a done step's lines folded away" },
            { key: "ring", path: "ring", type: "choice", words: ["none", "left", "right", "right-near-text"],
              about: "the turning ring" }] },
        { section: "prompt", about: "A line that waits on the user: framed, placed and blinking when its key is true.", keys: [
            { key: "align", path: "prompt.align", type: "choice", words: ["left", "center", "right"], about: "on its row" },
            { key: "open", path: "prompt.open", type: "text", bytes: 16, about: "before the line" },
            { key: "close", path: "prompt.close", type: "text", bytes: 16, about: "after it" },
            { key: "blink", path: "prompt.blink", type: "flag", about: "blinking at blink_ms" },
            { key: "keys", path: "prompt.lines.keys", type: "flag", about: "the keys screen's drop line" },
            { key: "done", path: "prompt.lines.done", type: "flag", about: "the ESC line after a run" },
            { key: "failed", path: "prompt.lines.failed", type: "flag", about: "the ESC line after a failed run" },
            { key: "aborting", path: "prompt.lines.aborting", type: "flag", about: "a run being aborted" }] },
        { section: "transitions", about: "Milliseconds, 0 to 10000; 0 turns the thing off.", keys: [
            { key: "fade_in_ms", path: "fade_in_ms", type: "ms", about: "what comes after a fade out, from black" },
            { key: "fade_out_ms", path: "fade_out_ms", type: "ms", about: "the menu as a run starts, a run ESC leaves" },
            { key: "line_in", path: "line_in", type: "choice", words: ["none", "typing", "slide", "fade"],
              about: "how a step's line comes in" },
            { key: "line_in_ms", path: "line_in_ms", type: "ms", about: "slide and fade's length" },
            { key: "typing_ms", path: "typing_ms", type: "ms", about: "a character of the running line, any other line whole" },
            { key: "typing", path: "typing_sync", type: "choice", words: ["async", "sync"], values: [false, true],
              about: "sync: one line at a time" },
            { key: "blink_ms", path: "blink_ms", type: "ms", about: "the cursor's and the prompt's blink" },
            { key: "scroll_ms", path: "scroll_ms", type: "ms", about: "a line too long for its row slides a column each" }] },
        { section: "splash", about: "The boot's: the program's icon on a page.", keys: [
            { key: "page", path: "splash.page", type: "color", about: "behind the icon" },
            { key: "ms", path: "splash.ms", type: "ms", about: "how long; 0: none" },
            { key: "chance", path: "splash.chance", type: "ms", max: 100,
              about: "the boots in 100 that show this theme's, the default theme's the others" }] }
    ];
    // what the GUI makes of a form's value: a note when it would not take it, or would draw it otherwise
    function check(field, value) {
        if (field.type === "text") {
            var n = utf8Length(value), bad = undrawable(value);
            if (n >= field.bytes)
                return { ok: false, note: n + " bytes, over " + (field.bytes - 1) + ": the base's value stays" };
            return { ok: true, note: n + "/" + (field.bytes - 1) + " bytes" +
                     (bad.length ? "; not in the font, shows as ?: " + bad.join(" ") : "") };
        }
        if (field.type === "color") return colour(value) ? { ok: true, note: "" } : { ok: false, note: "#RRGGBB" };
        if (field.type === "ms") {
            var v = integer(String(value));
            return v === null ? { ok: false, note: "0 to 10000" }
                : field.max && v > field.max ? { ok: true, note: "over " + field.max + ": " + field.max } : { ok: true, note: "" };
        }
        return { ok: true, note: "" };
    }

    // ---- a run's steps, as steps.c makes them from the driver's and the runner's lines ----

    var STEPS_MAX = 24, NOTES_MAX = 128;
    function Steps() { this.step = []; this.note = []; this.serial = 0; this.gpu = false; }
    Steps.prototype.current = function () { return this.step.length ? this.step[this.step.length - 1] : null; };
    Steps.prototype.begin = function (label, detail, now) {
        var last = this.current();
        if (last && last.state === "active") last.state = "done";
        if (this.step.length === STEPS_MAX) this.step.shift();
        this.step.push({ label: label, detail: cutBytes(detail, 95), state: "active", value: 0, total: 0, shown: now,
                         serial: ++this.serial });
    };
    Steps.prototype.addNote = function (s, now) {
        s = s.replace(/^[ \t]+/, "");
        if (!s || !this.step.length) return;
        if (this.note.length === NOTES_MAX) this.note.shift();
        this.note.push({ text: cutBytes(s, 111), shown: now, step: this.current().serial });
    };
    Steps.prototype.line = function (s, now) {
        var last = this.current(), before = this.serial, m;
        s = cutBytes(s, 255); // the line buffer's 256 bytes
        var at = s.indexOf("compiled block ");
        if (at >= 0 && last && last.label === "RECOMPILE" && (m = /^compiled block (\d+)\/(\d+)/.exec(s.slice(at)))) {
            last.value = Number(m[1]);
            last.total = Number(m[2]);
        } else if (s.indexOf("Unpacking ") === 0) this.begin("UNPACK", s.slice(10), now);
        else if (s.indexOf("Extracting ") === 0) this.begin("EXTRACT", s.slice(11), now);
        else if (s.indexOf("Building hactool") === 0) this.begin("TOOLS", "hactool", now);
        else if (s.indexOf("Recompiling ") === 0) {
            var name = s.slice(12), end = name.indexOf(" (");
            this.begin("RECOMPILE", end >= 0 ? name.slice(0, end) : name, now);
        } else if (s.indexOf("Built ") === 0) {
            this.begin("BUILT", s.slice(6), now);
            this.current().state = "done";
        } else if (s.indexOf("ScarletNX - ") === 0) this.begin("LAUNCH", s.slice(12), now);
        else if (s.indexOf("Ready ") === 0) this.begin("READY", s.slice(6), now);
        else if (s.indexOf("vulkan: ") === 0 && !this.gpu && s.indexOf(", Vulkan ") >= 0) {
            // the first device line: "vulkan: <device> [(<driver>)], Vulkan <version>, ..."
            var device = s.slice(8), stop = device.indexOf(", Vulkan "), paren = device.indexOf(" (");
            if (paren >= 0 && paren < stop) stop = paren;
            this.begin("GPU", device.slice(0, stop), now);
            this.gpu = true;
        }
        if (this.serial === before) this.addNote(s, now); // not a step of its own: a line of the current one
    };
    Steps.prototype.finish = function (ok) {
        var last = this.current();
        if (last && last.state === "active") last.state = ok ? "done" : "failed";
        else if (last && !ok) last.state = "failed";
    };
    Steps.prototype.percent = function () {
        var percent = -1;
        this.step.forEach(function (s) {
            if (s.label === "RECOMPILE")
                percent = s.state === "done" ? 100 : s.total ? Math.floor(s.value * 100 / s.total) : 0;
            else if (s.label === "BUILT" || s.label === "LAUNCH" || s.label === "READY") percent = 100;
        });
        return percent;
    };
    Steps.prototype.notesOf = function (s) {
        return this.note.filter(function (n) { return n.step === s.serial; });
    };

    // ---- the screen: a pixel buffer drawn as SDL's software renderer draws ----

    function rgb(hex) { return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)]; }
    function Surface(w, h) { this.w = w; this.h = h; this.px = new Uint8ClampedArray(w * h * 4); }
    Surface.prototype.clear = function (c) {
        for (var i = 0; i < this.w * this.h; ++i) {
            this.px[i * 4] = c[0]; this.px[i * 4 + 1] = c[1]; this.px[i * 4 + 2] = c[2]; this.px[i * 4 + 3] = 255;
        }
    };
    Surface.prototype.put = function (x, y, c) {
        if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
        var i = (y * this.w + x) * 4;
        this.px[i] = c[0]; this.px[i + 1] = c[1]; this.px[i + 2] = c[2]; this.px[i + 3] = 255;
    };
    function mulDiv255(a, b) { var x = (a * b + 1) & 0xFFFF; x = (x + (x >> 8)) & 0xFFFF; return x >> 8; }
    // a filled rectangle: SDL truncates each coordinate; alpha under 255 blends as SDL_BlendFillRect does
    Surface.prototype.fill = function (x, y, w, h, c, alpha) {
        if (alpha === undefined) alpha = 255;
        var x0 = Math.trunc(x), y0 = Math.trunc(y), ww = Math.trunc(w), hh = Math.trunc(h);
        if (ww < 0) { ww = -ww; x0 -= ww; }
        if (hh < 0) { hh = -hh; y0 -= hh; }
        var x1 = Math.min(this.w, x0 + ww), y1 = Math.min(this.h, y0 + hh);
        x0 = Math.max(0, x0); y0 = Math.max(0, y0);
        var r = c[0], g = c[1], b = c[2], inva = 255 - alpha;
        if (alpha < 255) { r = Math.floor(r * alpha / 255); g = Math.floor(g * alpha / 255); b = Math.floor(b * alpha / 255); }
        for (var yy = y0; yy < y1; ++yy)
            for (var xx = x0; xx < x1; ++xx) {
                var i = (yy * this.w + xx) * 4;
                if (alpha === 255) { this.px[i] = r; this.px[i + 1] = g; this.px[i + 2] = b; }
                else {
                    this.px[i] = Math.floor(inva * this.px[i] / 255) + r;
                    this.px[i + 1] = Math.floor(inva * this.px[i + 1] / 255) + g;
                    this.px[i + 2] = Math.floor(inva * this.px[i + 2] / 255) + b;
                }
                this.px[i + 3] = 255;
            }
    };
    // a glyph, nearest-scaled into its cell, in color at alpha (the font texture's colour and alpha mod)
    Surface.prototype.glyph = function (x, y, w, h, code, c, alpha) {
        var x0 = Math.trunc(x), y0 = Math.trunc(y), ww = Math.trunc(w), hh = Math.trunc(h);
        if (alpha === undefined) alpha = 255;
        if (!alpha) return;
        for (var yy = 0; yy < hh; ++yy) {
            var py = y0 + yy;
            if (py < 0 || py >= this.h) continue;
            var bits = FONT[code * 16 + Math.floor(yy * 16 / hh)];
            for (var xx = 0; xx < ww; ++xx) {
                var px = x0 + xx;
                if (px < 0 || px >= this.w || !(bits & (0x80 >> Math.floor(xx * 8 / ww)))) continue;
                var i = (py * this.w + px) * 4;
                if (alpha === 255) { this.px[i] = c[0]; this.px[i + 1] = c[1]; this.px[i + 2] = c[2]; }
                else
                    for (var k = 0; k < 3; ++k)
                        this.px[i + k] = mulDiv255(255 - alpha, this.px[i + k]) + mulDiv255(c[k], alpha);
            }
        }
    };
    // SDL_DrawLines on integer points: horizontal, vertical and diagonal spans, Bresenham for the rest
    Surface.prototype.segment = function (x1, y1, x2, y2, c, drawEnd) {
        var self = this, i, n;
        if (y1 === y2) {
            var xa = Math.min(x1, x2), xb = Math.max(x1, x2);
            n = drawEnd ? xb - xa + 1 : xb - xa;
            var from = x1 <= x2 ? x1 : drawEnd ? x2 : x2 + 1;
            for (i = 0; i < n; ++i) self.put(from + i, y1, c);
        } else if (x1 === x2) {
            n = drawEnd ? Math.abs(y2 - y1) + 1 : Math.abs(y2 - y1);
            var fromY = y1 <= y2 ? y1 : drawEnd ? y2 : y2 + 1;
            for (i = 0; i < n; ++i) self.put(x1, fromY + i, c);
        } else if (Math.abs(x1 - x2) === Math.abs(y1 - y2)) {
            var sx, x, y;
            if (y1 <= y2) { x = x1; y = y1; sx = x1 <= x2 ? 1 : -1; n = y2 - y1; }
            else {
                x = x2; y = y2; sx = x2 <= x1 ? 1 : -1; n = y1 - y2;
                if (!drawEnd) { x += sx; y += 1; }
            }
            if (drawEnd) ++n;
            for (i = 0; i < n; ++i) self.put(x + sx * i, y + i, c);
        } else {
            var dx = Math.abs(x2 - x1), dy = Math.abs(y2 - y1), d, d1, d2, xi1, xi2, yi1, yi2;
            if (dx >= dy) { n = dx + 1; d = 2 * dy - dx; d1 = dy * 2; d2 = (dy - dx) * 2; xi1 = 1; xi2 = 1; yi1 = 0; yi2 = 1; }
            else { n = dy + 1; d = 2 * dx - dy; d1 = dx * 2; d2 = (dx - dy) * 2; xi1 = 0; xi2 = 1; yi1 = 1; yi2 = 1; }
            if (x1 > x2) { xi1 = -xi1; xi2 = -xi2; }
            if (y1 > y2) { yi1 = -yi1; yi2 = -yi2; }
            var bx = x1, by = y1;
            if (!drawEnd) --n;
            for (i = 0; i < n; ++i) {
                self.put(bx, by, c);
                if (d < 0) { d += d1; bx += xi1; by += yi1; } else { d += d2; bx += xi2; by += yi2; }
            }
        }
    };
    // SDL_RenderLines: each float point truncated (SW_QueueDrawPoints), the last one drawn when the line is open
    Surface.prototype.lines = function (points, c) {
        var p = points.map(function (q) { return [Math.trunc(q[0]), Math.trunc(q[1])]; });
        for (var i = 1; i < p.length; ++i) {
            var x1 = p[i - 1][0], y1 = p[i - 1][1], x2 = p[i][0], y2 = p[i][1];
            if (Math.max(x1, x2) < 0 || Math.max(y1, y2) < 0 || Math.min(x1, x2) >= this.w || Math.min(y1, y2) >= this.h)
                continue;
            this.segment(x1, y1, x2, y2, c, x1 === x2 && y1 === y2);
        }
        if (p[0][0] !== p[p.length - 1][0] || p[0][1] !== p[p.length - 1][1]) this.put(p[p.length - 1][0], p[p.length - 1][1], c);
    };
    // SDL_RenderRect: five points, in float
    Surface.prototype.outline = function (x, y, w, h, c) {
        var x1 = f(f(x + w) - 1), y1 = f(f(y + h) - 1);
        this.lines([[x, y], [x1, y], [x1, y1], [x, y1], [x, y]], c);
    };

    // ---- the program's icon: its PNG's pixels, as SDL_LoadPNG gives them ----

    var ICON = null;
    function base64Bytes(b64) {
        var raw = typeof atob === "function" ? atob(b64) : Buffer.from(b64, "base64").toString("binary");
        var out = new Uint8Array(raw.length);
        for (var i = 0; i < raw.length; ++i) out[i] = raw.charCodeAt(i);
        return out;
    }
    // an 8-bit RGBA PNG's size and its image data, still deflated
    function pngData(png) {
        var w = 0, h = 0, parts = [], at = 8, total = 0;
        while (at + 8 <= png.length) {
            var n = (png[at] << 24 | png[at + 1] << 16 | png[at + 2] << 8 | png[at + 3]) >>> 0;
            var type = String.fromCharCode(png[at + 4], png[at + 5], png[at + 6], png[at + 7]);
            if (type === "IHDR") {
                w = (png[at + 8] << 24 | png[at + 9] << 16 | png[at + 10] << 8 | png[at + 11]) >>> 0;
                h = (png[at + 12] << 24 | png[at + 13] << 16 | png[at + 14] << 8 | png[at + 15]) >>> 0;
                if (png[at + 16] !== 8 || png[at + 17] !== 6 || png[at + 20]) throw new Error("the icon is not 8-bit RGBA");
            }
            if (type === "IDAT") { parts.push(png.subarray(at + 8, at + 8 + n)); total += n; }
            at += 12 + n;
        }
        var idat = new Uint8Array(total), k = 0;
        parts.forEach(function (p) { idat.set(p, k); k += p.length; });
        return { w: w, h: h, idat: idat };
    }
    // the rows unfiltered (PNG's five filters) into RGBA
    function pngPixels(w, h, raw) {
        var stride = w * 4, out = new Uint8Array(stride * h), j = 0;
        for (var y = 0; y < h; ++y) {
            var filter = raw[j++], row = y * stride;
            for (var x = 0; x < stride; ++x, ++j) {
                var a = x >= 4 ? out[row + x - 4] : 0, b = y ? out[row - stride + x] : 0;
                var c = x >= 4 && y ? out[row - stride + x - 4] : 0, v = raw[j];
                if (filter === 1) v += a;
                else if (filter === 2) v += b;
                else if (filter === 3) v += (a + b) >> 1;
                else if (filter === 4) {
                    var p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
                    v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
                }
                out[row + x] = v & 255;
            }
        }
        return out;
    }
    // the icon, its image data inflated by inflate (zlib's, or the browser's DecompressionStream): a promise in the
    // browser, at once in node
    function loadIcon(inflate) {
        if (!iconPng) return null;
        var png = pngData(base64Bytes(iconPng));
        function done(raw) { ICON = { w: png.w, h: png.h, rgba: pngPixels(png.w, png.h, raw) }; return ICON; }
        if (inflate) return done(inflate(png.idat));
        var stream = new Blob([png.idat]).stream().pipeThrough(new DecompressionStream("deflate"));
        return new Response(stream).arrayBuffer().then(function (b) { return done(new Uint8Array(b)); });
    }
    if (typeof module !== "undefined" && iconPng) loadIcon(function (d) { return new Uint8Array(require("zlib").inflateSync(d)); });

    // SDL's linear stretch (SDL_stretch.c, its SSE2 code, which x86-64 takes): 7-bit weights, the rows first in full,
    // the columns after, a pixel's centre at 0.5, the edges held
    function scaler(n, size) {
        var step = Math.floor(n * 65536 / size), x0 = Math.floor((step * 32768 + 0x8000) / 65536) - 32768;
        var left = 0, right = 0;
        for (var i = 0, fp = x0; i < size; ++i, fp += step) {
            if (fp < 0) ++left;
            else if ((fp >> 16) > n - 2) ++right;
        }
        return { start: x0, step: step, left: left, right: right };
    }
    function stretch(src, w, h, dw, dh) {
        var out = new Uint8Array(dw * dh * 4), sh = scaler(h, dh), sw = scaler(w, dw), fh = sh.start;
        for (var i = 0; i < dh; ++i, fh += sh.step) {
            var inside = !(i < sh.left || i > dh - 1 - sh.right);
            var y0 = inside ? fh >> 16 : i < sh.left ? 0 : h - 1, fy = inside ? (fh >> 9) & 127 : 0;
            var y1 = inside ? y0 + 1 : y0, fw = sw.start + sw.left * sw.step;
            for (var j = 0; j < dw; ++j) {
                var x0, fx;
                if (j < sw.left) { x0 = 0; fx = 0; }
                else if (j >= dw - sw.right) { x0 = w - 2; fx = 128; }
                else { x0 = fw >> 16; fx = (fw >> 9) & 127; fw += sw.step; }
                for (var k = 0; k < 4; ++k) {
                    var l = src[(y0 * w + x0) * 4 + k] * (128 - fy) + src[(y1 * w + x0) * 4 + k] * fy;
                    var r = src[(y0 * w + x0 + 1) * 4 + k] * (128 - fy) + src[(y1 * w + x0 + 1) * 4 + k] * fy;
                    out[(i * dw + j) * 4 + k] = Math.min(255, (l * (128 - fx) + r * fx) >> 14);
                }
            }
        }
        return out;
    }
    // The icon over the page at x, y, size pixels a side, as the software renderer copies a static texture. At its
    // own size the texture's RLE blit (SDL_RLEaccel.c): alpha 255 copied, 0 skipped, the others BLIT_TRANSL_888 on the
    // XRGB window, red and blue in one word. Stretched, SDL_StretchSurface then the AVX2 8888 blit:
    // (a*s + (255-a)*d + 1) * 257 >> 16
    Surface.prototype.icon = function (x, y, size) {
        if (!ICON) return;
        var same = size === ICON.w && size === ICON.h;
        var rgba = same ? ICON.rgba : stretch(ICON.rgba, ICON.w, ICON.h, size, size);
        for (var yy = 0; yy < size; ++yy)
            for (var xx = 0; xx < size; ++xx) {
                var px = x + xx, py = y + yy;
                if (px < 0 || py < 0 || px >= this.w || py >= this.h) continue;
                var s = (yy * size + xx) * 4, d = (py * this.w + px) * 4, a = rgba[s + 3], k;
                if (!same)
                    for (k = 0; k < 3; ++k)
                        this.px[d + k] = ((a * rgba[s + k] + (255 - a) * this.px[d + k] + 1) * 257) >>> 16;
                else if (a === 255)
                    for (k = 0; k < 3; ++k) this.px[d + k] = rgba[s + k];
                else if (a) {
                    var s1 = (rgba[s] << 16 | rgba[s + 2]) >>> 0, d1 = (this.px[d] << 16 | this.px[d + 2]) >>> 0;
                    d1 = (d1 + (Math.imul((s1 - d1) | 0, a) >>> 0 >>> 8)) & 0xff00ff;
                    var s2 = rgba[s + 1] << 8, d2 = this.px[d + 1] << 8;
                    d2 = (d2 + (Math.imul((s2 - d2) | 0, a) >>> 0 >>> 8)) & 0xff00;
                    this.px[d] = d1 >>> 16;
                    this.px[d + 1] = d2 >>> 8;
                    this.px[d + 2] = d1 & 0xff;
                }
            }
    };

    // ---- what the GUI shows: its words, a sample of games, a run's output ----

    var ITEMS = ["Load Switch NSP/XCI/NRO", "Load Linux ARM ELF", "Load 3DS CIA", "Setup device keys", "Fullscreen",
                 "Touch", "On-screen controls", "Enable libgccjit", "Enable gdbstub", "Theme", "Text size", "Share log",
                 "Exit"];
    var SWITCH = 0, KEYS = 3, FULLSCREEN = 4, TOUCH = 5, CONTROLS = 6, GCCJIT = 7, GDBSTUB = 8, THEME = 9, TEXT = 10,
        LOG = 11, EXIT = 12;
    // main.c's SAY_* and load_labels: a computer's, and a phone's (SDL_PLATFORM_ANDROID)
    var SAY = {
        computer: {
            load: ["-> Select via drag and drop", "-> Select file from games/ instead"],
            menu: "Arrows/mouse: move. Space/Enter/click: select.", loadHow: "Choose a load option. ESC: back.",
            games: "Up/Down: select. Enter/Space: open. Left/Right or PgUp/PgDown: page.",
            keys: "Setup device keys: drag and drop to this window", keysHow: "Ctrl+V: paste a path. ESC: back.",
            keysWait: "Drop prod.keys here", done: "Press [ESC] to return to menu",
            abort: "Press [ESC] to abort and return to menu", count: "executable(s)",
            fullscreen: "Enable fullscreen at startup",
            log: "Saves the last run's output and game log to scarletnx.log in the working folder, path copied",
            home: "/home/you", cwd: "/home/you/ScarletNX", phone: false
        },
        phone: {
            load: ["-> Select a file", "-> Select file from games/ instead"],
            menu: "Tap: select. Back: go back.", loadHow: "Choose a load option.",
            games: "Tap: open. Swipe across: turn the page. Back: go back.",
            keys: "Setup device keys: tap Pick prod.keys to open the file picker", keysHow: "Back: go back.",
            keysWait: "Pick prod.keys", done: "Tap to return to menu", abort: "Tap here to abort and return to menu",
            count: "game(s)", fullscreen: "The menu and the games on the whole screen, the system's bars hidden",
            log: "Saves the last run's output and game log to /sdcard/ScarletNX/scarletnx.log, then shares it",
            // HOME is the app's files; the working folder /sdcard/ScarletNX, as getcwd names it
            home: "/data/data/org.scarletnx/files", cwd: "/storage/emulated/0/ScarletNX", phone: true
        }
    };
    // gui_setting_description
    function description(item, say) {
        switch (item) {
            case FULLSCREEN: return say.fullscreen;
            case TOUCH: return "The game's touch screen: fingers, the mouse too, or off";
            case CONTROLS: return "A pad on the screen. The game's menu edits it";
            case GCCJIT: return "Program was not compiled with libgccjit";
            case GDBSTUB: return "Enables gdbstub on port 1234";
            case THEME: return "Built-in themes, then each themes/<name>/theme.ini";
            case TEXT: return "Bigger letters scroll the menu. Auto fits the screen";
            case LOG: return say.log;
            default: return "";
        }
    }
    var GAMES = ["Cult of the Lamb.nsp", "Cult of the Lamb", "Ender Magnolia Bloom in the Mist", "edenprobe.nro",
                 "edenprobe", "hello-world.nro"];
    // a run: the driver's and the runner's lines, at their milliseconds from its start
    var RUN = [
        [0, "Extracting Cult of the Lamb.nsp"],
        [700, "Extracted 3 NCAs, the program's 4 modules"],
        [1300, "Recompiling Cult of the Lamb (4 modules)"],
        [1600, "Functions: 48211  instructions: 2915002"],
        [1900, "LLVM: 5 code units and the module descriptor"],
        [2500, "  compiled block 1/6: code_000, 0x8000000-0x8E4C1F0, 9874 functions, 590210 instructions (8.1 s)"],
        [3100, "  compiled block 2/6: code_001, 0x8E4C1F0-0x9A0377C, 10022 functions, 601455 instructions (8.4 s)"],
        [3700, "  compiled block 3/6: code_002, 0x9A0377C-0xA61B804, 9567 functions, 588012 instructions (7.9 s)"],
        [4300, "  compiled block 4/6: code_003, 0xA61B804-0xB2C7A10, 9801 functions, 579990 instructions (8.0 s)"],
        [4900, "  compiled block 5/6: code_004, 0xB2C7A10-0xBE02C44, 8947 functions, 555335 instructions (7.6 s)"],
        [5300, "  compiled block 6/6: module, SnxModule descriptor, 291002 entries (0.4 s)"],
        [5600, "LLVM module: 87.4 MB, 291002 entries"],
        [5900, "Built /home/you/ScarletNX/games/Cult of the Lamb"],
        [6400, "ScarletNX - Cult of the Lamb"],
        [6900, "vulkan: AMD Radeon RX 7800 XT (RADV NAVI32), Vulkan 1.4.311, driver 25.1.0"],
        [7300, "audio: 48000 Hz, 2 channels"]
    ];
    var RUN_END = 9500;
    var VIEWS = ["menu", "load", "games", "keys", "run", "ended", "failed", "ask", "aborting", "splash"];
    function runView(view) { return ["run", "ended", "failed", "ask", "aborting"].indexOf(view) >= 0; }

    // the state the screen draws, as the GUI's App holds it; times in milliseconds of the app's clock
    function sampleState(view, phone) {
        var say = phone ? SAY.phone : SAY.computer;
        view = VIEWS.indexOf(view) >= 0 ? view : "menu";
        return {
            say: say, cols: 80, rows: 25, scale: 2, view: view,
            // a run is the Switch item's; the menu has the focus on Theme, as one making a theme would
            selected: runView(view) ? SWITCH : THEME,
            recent: [["Cult of the Lamb", say.cwd + "/games/Cult of the Lamb.nsp"],
                     ["edenprobe", say.cwd + "/games/edenprobe.nro"]],
            recentFocus: 0, gameSelected: 1, usage: "GUI + children: RAM 129.5 MiB (sum RSS)  CPU 25.7% (100% = 1 core)",
            // SDL_GetCurrentDirectory ends the working folder with a separator
            cwd: say.cwd + "/", gamesDir: say.cwd + "/games", keysPath: say.home + "/.switch/prod.keys", keysThere: true,
            file: say.cwd + "/games/Cult of the Lamb.nsp", runAt: 0,
            fadeMs: 0, enteringMs: 0, leavingMs: 0, message: ""
        };
    }
    // the steps and the console's lines of a run started at runAt, by now; ended: over, ok or not; its games/ in the
    // working folder say has
    function runSoFar(runAt, now, ended, ok, say) {
        var steps = new Steps(), lines = [], banner = false, cwd = (say || SAY.computer).cwd;
        RUN.forEach(function (r) {
            if (!ended && runAt + r[0] > now) return;
            var line = r[1].replace(SAY.computer.cwd, cwd);
            steps.line(line, runAt + r[0]);
            lines.push(line);
            if (line.indexOf("ScarletNX - ") === 0) banner = true;
        });
        if (ended) steps.finish(ok);
        return { steps: steps, lines: lines, banner: banner };
    }
    // model.c's gui_slide: how many columns a line over columns too many has slid at ms, resting 8 steps at each end
    function slide(over, ms, step) {
        if (over <= 0 || !step) return 0;
        var t = Math.floor(ms / step) % (2 * (over + 8));
        if (t < 8) return 0;
        if (t < 8 + over) return t - 8;
        if (t < 16 + over) return over;
        return over - (t - 16 - over);
    }
    // the live preview: the menu, a run, its end, ESC and the menu again, round and round, with the theme's fades
    // as the GUI's launch, pump and leave_run set them. ms: the time the preview has played
    var LOOP_MENU = 2500, LOOP_ENDED = 3000, LOOP_CLOCK = 1000;
    function loopLength(t) { return LOOP_MENU + RUN_END + LOOP_ENDED + t.fade_out_ms; }
    function loopState(t, ms, phone) {
        var now = LOOP_CLOCK + ms % loopLength(t), s = sampleState("menu", phone);
        s.selected = SWITCH;
        // back from the last run (leave_run): the menu fades in
        s.fadeMs = t.fade_in_ms ? LOOP_CLOCK : 0;
        var launch = LOOP_CLOCK + LOOP_MENU, end = launch + RUN_END, esc = end + LOOP_ENDED;
        if (now >= launch) {
            // launch: the menu fades out, then the run fades in; the run's lines come from its start
            s.view = now < end ? "run" : "ended";
            s.runAt = launch;
            s.enteringMs = t.fade_out_ms ? launch : 0;
            s.fadeMs = launch + (s.enteringMs ? t.fade_out_ms : 0);
            // ESC on the ended run: it fades out, then leave_run
            if (now >= esc) s.leavingMs = esc;
        }
        return { state: s, now: now };
    }

    // draws state s with theme t at now: the GUI's render, render_steps, render_ask and overlay. Returns the ring's
    // box ({x0, y0, x1, y1}, or null) and whether anything was drawn with an alpha under 1
    function render(surface, t, s, now) {
        var cols = s.cols, rows = s.rows, sc = s.scale, cw = 8 * sc, ch = 16 * sc, say = s.say;
        var C = {}; Object.keys(t.colors).forEach(function (k) { C[k] = rgb(t.colors[k]); });
        var R = {}; Object.keys(t.run_colors).forEach(function (k) { R[k] = rgb(t.run_colors[k]); });
        var info = { ring: null, partial: false };
        function text(x, y, value, color) {
            var cps = codepoints(value), skip = slide(cps.length - (cols - 1 - x), now, t.scroll_ms);
            for (var i = Math.max(0, skip); i < cps.length && x < cols - 1; ++i, ++x)
                surface.glyph(x * cw, y * ch, cw, ch, glyph(cps[i]), color, 255);
        }
        // main.c's text_px: from a pixel position, in float, chars at most
        function textPx(x, y, value, chars, color, alpha) {
            var cps = codepoints(value), w = f(cw), limit = f((cols - 1) * w), a = Math.trunc(f(alpha * 255));
            if (alpha < 1) info.partial = true;
            for (var i = 0; i < cps.length && i < chars; ++i, x = f(x + w))
                if (!(f(x + w) > limit)) surface.glyph(x, y, w, ch, glyph(cps[i]), color, a);
            return x;
        }
        function prompt(line, x, y, value, color) {
            var p = t.prompt;
            if (!p.lines[line]) { text(x, y, value, color); return; }
            if (p.blink && t.blink_ms && Math.floor(now / t.blink_ms) % 2) return;
            var framed = cutBytes(p.open + value + p.close, 159), width = codepoints(framed).length;
            if (p.align === "center") x = Math.trunc((cols - width) / 2);
            if (p.align === "right") x = cols - 1 - width;
            text(Math.max(0, x), y, framed, color);
        }
        function band(row, n, c) {
            var bottom = row + n === rows && rows < 100;
            var y = row ? row * ch : 0;
            surface.fill(0, y, surface.w, (bottom ? surface.h : (row + n) * ch) - y, c);
        }
        function rule(row, c) { surface.fill(cw, row * ch - sc, (cols - 2) * cw, sc, c); }
        function footer(row, n, page, ink, soft) {
            var bar = t.footer === "bar";
            if (bar) band(row, n, ink);
            if (t.footer_rule) rule(row, soft);
            text(1, row, s.usage, bar ? page : soft);
            text(1, row + 1, "CWD:", bar ? page : soft);
            text(6, row + 1, s.cwd, bar ? page : ink);
        }
        function entry(x, y, label, activated, focused) {
            if (focused && t.focus_bar) { band(y, 1, C.focus); text(x, y, label, C.page); }
            else text(x, y, label, activated ? C.active : focused ? C.focus : C.ink);
        }
        var view = s.view, running = runView(view);
        var finished = view === "ended" || view === "failed", abnormal = view === "failed", aborting = view === "aborting";
        var run = running ? runSoFar(s.runAt, now, finished, !abnormal, say) : null;
        var message = view === "ended" ? "Driver exited with status 0."
            : abnormal ? "Program ended abnormally (status 1)." : s.message;
        var entering = !!s.enteringMs && now < s.enteringMs + t.fade_out_ms;
        var idle = !running || entering;
        var head = t.head !== "none", foot = t.footer !== "none";

        function overlay() {
            var a = 0;
            if (entering) a = f(f(now > s.enteringMs ? now - s.enteringMs : 0) / f(t.fade_out_ms));
            else if (s.leavingMs && t.fade_out_ms)
                a = Math.min(1, f(f(now > s.leavingMs ? now - s.leavingMs : 0) / f(t.fade_out_ms)));
            else if (s.fadeMs && t.fade_in_ms && now < s.fadeMs + t.fade_in_ms)
                a = f(1 - f(f(now > s.fadeMs ? now - s.fadeMs : 0) / f(t.fade_in_ms)));
            if (a <= 0) return;
            if (a < 1) info.partial = true;
            surface.fill(0, 0, surface.w, surface.h, [0, 0, 0], Math.trunc(f(a * 255)));
        }
        // render_ask: the abort question over a running run, in the run screen's colours
        function ask() {
            if (view !== "ask") return;
            var steps = t.run === "steps";
            var page = steps ? R.page : C.page, ink = steps ? R.ink : C.ink, soft = steps ? R.soft : C.soft;
            var warning = steps ? R.warning : C.warning, line = sc;
            var question = run.banner ? "Abort the run?" : "Abort the recompile? Its work is lost.";
            var bw = Math.min(cols - 2, codepoints(question).length + 4), col = Math.trunc((cols - bw) / 2);
            var row = Math.max(0, Math.trunc((rows - 6) / 2));
            surface.fill(col * cw, row * ch, bw * cw, 6 * ch, page);
            surface.fill(col * cw, row * ch, bw * cw, line, soft);
            surface.fill(col * cw, (row + 6) * ch - line, bw * cw, line, soft);
            surface.fill(col * cw, row * ch, line, 6 * ch, soft);
            surface.fill((col + bw) * cw - line, row * ch, line, 6 * ch, soft);
            text(col + 2, row + 1, question, warning);
            ["Keep going", "Abort"].forEach(function (choice, i) {
                var focused = i === 0, bar = focused && (steps || t.focus_bar);
                if (bar) surface.fill(col * cw + line, (row + 3 + i) * ch, bw * cw - 2 * line, ch, ink);
                text(col + 2, row + 3 + i, t.marker + choice, bar ? page : focused ? C.focus : ink);
            });
        }
        if (view === "splash") {
            // splash_shown: the program's icon, whole steps of its 128 pixels, in the middle of the splash page
            surface.clear(rgb(t.splash.page));
            var size = 128 * Math.max(1, Math.trunc(Math.min(surface.w, surface.h) / 3 / 128));
            surface.icon(Math.trunc(f((surface.w - size) / 2)), Math.trunc(f((surface.h - size) / 2)), size);
            info.icon = !!ICON;
            return info;
        }
        surface.clear(C.page);
        if (!idle && t.run === "steps") {
            surface.clear(R.page);
            renderSteps(surface, t, s, now, run, finished, abnormal, aborting, message, text, textPx, prompt, footer, info);
            ask();
            overlay();
            return info;
        }
        var screen = idle ? (view === "games" ? "games" : view === "keys" ? "keys" : "menu")
            : run.banner ? "loading" : "compiling";
        var title = t.title[screen];
        if (head && title) {
            if (t.head === "bar") band(0, 1, C.ink);
            text(1, 0, title, t.head === "bar" ? C.page : C.ink);
        }
        if (head && t.head_rule) rule(4, C.soft);
        var load = view === "load";
        if (view === "games" && idle) {
            if (head) { text(1, 1, say.games, C.ink); text(1, 2, s.gamesDir, C.soft); }
            entry(1, 3, "Back [ESC]", false, s.gameSelected === 0);
            var pageSize = Math.max(1, rows - 10), shown = GAMES.slice(0, pageSize);
            shown.forEach(function (name, i) { entry(1, 5 + i, name, false, s.gameSelected === i + 1); });
            text(1, rows - 5, "Page 1/" + Math.max(1, Math.ceil(GAMES.length / pageSize)) + "   " + GAMES.length + " " +
                 say.count, C.soft);
            text(1, rows - 4, s.message, C.focus);
        } else if (view === "keys" && idle) {
            if (head) { text(1, 1, say.keys, C.ink); text(1, 2, say.keysHow, C.soft); text(1, 3, s.keysPath, C.ink); }
            if (s.keysThere) text(1, 4, "Keys already setup. This will overwrite the previous ones", C.failure);
            text(1, 6, s.message, C.focus);
            entry(1, 8, "Back [ESC]", false, true);
            prompt("keys", 1, Math.max(Math.trunc(rows / 2), 10), say.keysWait, C.focus);
        } else if (idle) {
            // the load options open under the Switch item, the focus on the second (focus_load)
            var recentRows = s.recent.length ? s.recent.length + 2 : 0, lastRow = rows - 7;
            var rowFull = function (item) { return 4 + recentRows + item + (load && item > SWITCH ? 2 : 0); };
            var focusRow = s.recentFocus ? 4 + s.recentFocus : load ? rowFull(SWITCH) + 1 + 1 : rowFull(s.selected);
            var offset = Math.max(0, focusRow - lastRow);
            var shows = function (row) { return row >= 4 && row <= lastRow; };
            if (head) { text(1, 1, say.menu, C.ink); text(1, 2, say.loadHow, C.soft); }
            if (s.recent.length && shows(4 - offset)) text(1, 4 - offset, "Recent games", C.soft);
            s.recent.forEach(function (g, i) {
                var row = 5 + i - offset;
                if (shows(row)) entry(1, row, t.marker + g[0], false, s.recentFocus === i + 1 && !load);
            });
            for (var i = 0; i < ITEMS.length; ++i) {
                var row = rowFull(i) - offset, label;
                if (i === FULLSCREEN || i === CONTROLS || i === GCCJIT || i === GDBSTUB)
                    label = t.marker + "[" + ((i === CONTROLS || i === FULLSCREEN) && say.phone ? "ON" : "OFF") + "] " +
                        ITEMS[i];
                else if (i === THEME) label = t.marker + ITEMS[i] + ": " + t.name;
                else if (i === TEXT) label = t.marker + ITEMS[i] + ": Auto";
                else if (i === TOUCH) label = t.marker + ITEMS[i] + ": Fingers";
                else label = t.marker + ITEMS[i];
                label = cutBytes(label, 99);
                if (shows(row)) entry(1, row, label, load && i === SWITCH, !s.recentFocus && !load && s.selected === i);
                if (load && i === SWITCH) {
                    if (shows(row + 1)) entry(3, row + 1, say.load[0], false, false);
                    if (shows(row + 2)) entry(3, row + 2, say.load[1], false, true);
                }
            }
            var logTop = rowFull(EXIT) - offset + 6;
            if (logTop - 4 < rows - 4) text(1, logTop - 4, s.message, C.focus);
        } else if (head) {
            text(1, 1, finished ? message : ITEMS[s.selected], abnormal ? C.failure : finished ? C.focus : C.active);
            text(1, 2, s.file, C.ink);
            if (finished) prompt(abnormal ? "failed" : "done", 1, 3, say.done, C.failure);
            else if (aborting) prompt("aborting", 1, 3, "Aborting process tree...", C.failure);
            else text(1, 3, say.abort, C.failure);
        }
        if (running && !entering) {
            // the console (model.c): rows - 8 rows of cols - 2 columns from row 4, a line wrapping at its edge, the
            // oldest rows going up and out; the row after the last line is the cursor's, empty
            var top = 4, lr = Math.max(1, rows - top - 4), lc = Math.max(1, cols - 2), cells = [];
            run.lines.forEach(function (l) {
                var cps = codepoints(l);
                do { cells.push(cps.slice(0, lc)); cps = cps.slice(lc); } while (cps.length);
            });
            if (cells.length > lr - 1) cells = cells.slice(cells.length - (lr - 1));
            cells.forEach(function (cps, y) {
                if (top + y < rows - 4)
                    cps.forEach(function (cp, x) { if (cp !== 32) surface.glyph((x + 1) * cw, (top + y) * ch, cw, ch, glyph(cp), C.ink, 255); });
            });
        }
        if (idle && !load && view !== "games" && view !== "keys")
            text(1, rows - 4, s.recentFocus ? s.recent[s.recentFocus - 1][1] : description(s.selected, say), C.ink);
        if (foot) footer(rows - 3, 3, C.page, C.ink, C.soft);
        ask();
        overlay();
        return info;
    }

    // the loading screen: render_steps
    function renderSteps(surface, t, s, now, run, finished, abnormal, aborting, message, text, textPx, prompt, footer,
                         info) {
        var cols = s.cols, rows = s.rows, sc = s.scale, cw = f(8 * sc), ch = f(16 * sc);
        var R = {}; Object.keys(t.run_colors).forEach(function (k) { R[k] = rgb(t.run_colors[k]); });
        var steps = run.steps, since = s.fadeMs, foot = t.footer !== "none" ? 2 : 0, top = 3;
        var white = [255, 255, 255], i, r;
        function dots() { return finished ? "..." : ["", ".", "..", "..."][Math.floor(now / 400) % 4]; }
        // an arc of a circle, from and sweep in degrees, thickness pixels inward, as main.c's arc computes it
        function arc(cx, cy, rad, from, sweep, thickness, c) {
            for (var th = 0; th < thickness; th = f(th + 1)) {
                var p = [];
                for (var k = 0; k <= 48; ++k) {
                    var a = f(f(f(from + f(f(sweep * k) / 48)) * f(Math.PI)) / 180), rr = f(rad - th);
                    p.push([f(cx + f(rr * f(Math.cos(a)))), f(cy + f(rr * f(Math.sin(a))))]);
                }
                surface.lines(p, c);
            }
        }
        function ring(cx, cy) {
            var rad = f(7 * sc), inner = f(rad * f(0.62)), thick = Math.max(1, f(1.5 * sc));
            var angle = finished ? 0 : Math.floor(now / 4) % 360;
            arc(cx, cy, rad, 0, 360, Math.max(1, f(0.5 * sc)), R.dim);
            arc(cx, cy, inner, 0, 360, thick, R.soft);
            arc(cx, cy, inner, angle, 70, thick, R.ink);
            info.ring = { x0: Math.floor(cx - rad) - 1, y0: Math.floor(cy - rad) - 1, x1: Math.ceil(cx + rad) + 1,
                          y1: Math.ceil(cy + rad) + 1 };
        }
        if (t.texture) for (var y = 3; y < surface.h; y += 4) surface.fill(0, y, surface.w, 1, white, 14);
        // run_name: the runner's banner, else the file's own name; its last path part, in capitals
        var name = s.file, fromFile = true;
        steps.step.forEach(function (st) { if (st.label === "LAUNCH") { name = st.detail; fromFile = false; } });
        name = name.slice(Math.max(name.lastIndexOf("/"), name.lastIndexOf("\\")) + 1);
        if (fromFile && name.lastIndexOf(".") >= 0) name = name.slice(0, name.lastIndexOf("."));
        name = upper(cutBytes(name, 95));
        var col = t.ring === "left" ? 4 : 1;
        var title = t.title[run.banner ? "loading" : "compiling"];
        var nameCol = col + codepoints(title).length + (title ? 1 : 0);
        if (t.ring === "left") ring(f(cw * 2), f(ch * f(1.5)));
        if (t.ring === "right") ring(f(surface.w - f(cw * 2)), f(ch * f(1.5)));
        if (t.ring === "right-near-text")
            ring(f(f(cw * (nameCol + codepoints(name).length + 4)) + f(7 * sc)), f(ch * f(1.5)));
        text(col, 1, title, R.ink);
        text(nameCol, 1, name + dots(), R.soft);
        if (finished) text(1, 2, message, abnormal ? R.failure : R.soft);
        // the rows: each step, then its lines when detailed, folded once done when collapse says so
        var list = [];
        function clip(runs, note, room) {
            var lens = runs.map(function (x) { return codepoints(x).length; }), total = lens[0] + lens[1] + lens[2];
            if (room < 8 || total <= room) return;
            var cut = note ? 0 : 1, marker = note ? 3 : 0, other = total - lens[cut];
            var left = room > other + marker ? room - other - marker : 0;
            runs[cut] = codepoints(runs[cut]).slice(0, left).map(function (c) { return String.fromCodePoint(c); }).join("") +
                (note ? "..." : "");
        }
        steps.step.forEach(function (st) {
            var runs = [st.label + ":", " " + upper(st.detail),
                        st.state === "failed" ? "...FAILED" : st.state === "done" ? "...OK"
                            : st.total ? " " + st.value + " / " + st.total : ""];
            clip(runs, false, cols - 6);
            list.push({ owner: st, note: false, shown: Math.max(st.shown, since), runs: runs });
            if (!t.detailed || (t.collapse && st.state === "done")) return;
            steps.notesOf(st).forEach(function (n) {
                var nr = [n.text, "", ""];
                clip(nr, true, cols - 5);
                list.push({ owner: st, note: true, shown: Math.max(n.shown, since), runs: nr });
            });
        });
        var lastStep = -1;
        list.forEach(function (row, k) { if (!row.note) lastStep = k; });
        var bottom = (t.bar ? rows - 5 : rows - 2) - foot, fit = Math.max(1, bottom - top);
        var first = Math.max(0, list.length - fit);
        list.forEach(function (row, k) {
            row.lens = row.runs.map(function (x) { return codepoints(x).length; });
            row.total = row.lens[0] + row.lens[1] + row.lens[2];
            row.slow = row.owner.state === "active" && (k + 1 === list.length || list[k + 1].owner !== row.owner);
        });
        // type_rows: how far each row has typed
        var typing = -1, freeAt = 0;
        list.forEach(function (row, k) {
            var span = row.slow ? t.typing_ms * row.total : t.typing_ms;
            row.typed = row.total;
            if (k < first || t.line_in !== "typing" || !t.typing_ms) return;
            var start = t.typing_sync ? Math.max(row.shown, freeAt) : row.shown;
            freeAt = start + span;
            if (now < start) row.typed = 0;
            else if (now - start < span) row.typed = Math.floor((now - start) * row.total / span);
            if (now >= start && row.typed < row.total) typing = k;
        });
        var cursor = typing >= 0 ? typing : lastStep;
        var lastOwner = steps.step[steps.step.length - 1];
        for (r = first; r < list.length; ++r) {
            var row = list[r], st = row.owner, last = st === lastOwner;
            var failed = st.state === "failed", active = st.state === "active";
            var age = now > row.shown ? now - row.shown : 0, moving = t.line_in === "slide" || t.line_in === "fade";
            var p = moving && t.line_in_ms ? Math.min(1, f(f(age) / f(t.line_in_ms))) : 1, q = f(1 - p);
            var x = f(f(cw * (row.note ? 3 : 1)) - (t.line_in === "slide" ? f(f(f(16 * sc) * q) * q) : 0));
            var y2 = f(ch * (top + r - first));
            var color = [failed ? R.failure : last ? R.ink : R.soft, failed ? R.failure : last || active ? R.ink : R.soft,
                         failed ? R.failure : R.ink];
            if (row.note) color[0] = R.soft;
            var left = row.typed;
            for (i = 0; i < 3; ++i) {
                var drawn = Math.min(left, row.lens[i]);
                x = textPx(x, y2, row.runs[i], drawn, color[i], p);
                left -= drawn;
            }
            if (!row.note && row.typed === row.total && active) x = textPx(x, y2, dots(), 3, R.ink, p);
            var blink = !t.blink_ms || Math.floor(now / t.blink_ms) % 2 === 0;
            var working = typing === r || (typing < 0 && active);
            if (r === cursor && working && blink) textPx(x, y2, "_", 1, R.ink, p);
        }
        if (t.bar) {
            var percent = steps.percent(), segments = 40;
            var filled = percent < 0 ? 0 : Math.floor((percent * segments + 50) / 100);
            var span = f((cols - 8) * cw), gap = f(2 * sc);
            var seg = f(f(span - f(gap * (segments - 1))) / segments);
            var sy = f(f(ch * (rows - foot - 3)) + f(ch * f(0.3))), rh = f(ch * f(0.4));
            surface.fill(cw, f(f(ch * (rows - foot - 4)) + f(ch / 2)), f((cols - 2) * cw), sc, R.dim);
            for (var k = 0; k < segments; ++k) {
                var rx = f(cw + f(k * f(seg + gap)));
                if (k < filled) surface.fill(rx, sy, seg, rh, R.ink);
                else surface.outline(rx, sy, seg, rh, R.dim);
            }
            var number = percent < 0 ? " --%" : ("   " + percent).slice(-3) + "%";
            text(cols - 6, rows - foot - 3, number, R.ink);
            text(1, rows - foot - 2, name, R.ink);
        }
        if (foot) footer(rows - 3, 2, R.page, R.ink, R.soft);
        if (finished) prompt(abnormal ? "failed" : "done", 1, rows - 1, s.say.done, R.soft);
        else if (aborting) prompt("aborting", 1, rows - 1, "Aborting process tree...", R.warning);
        else text(1, rows - 1, s.say.abort, R.soft);
    }

    setThemes(typeof SNX_THEMES !== "undefined" ? SNX_THEMES
        : typeof module !== "undefined" ? require("./themes.js").SNX_THEMES : {});

    var api = {
        BUILTINS: BUILTINS, BUILTIN_TEXTS: BUILTIN_TEXTS, setThemes: setThemes, themeIds: themeIds, builtin: builtin, parse: parse, serialize: serialize, fileKeys: fileKeys,
        utf8Length: utf8Length, drawable: drawable, undrawable: undrawable, glyph: glyph, Steps: Steps,
        Surface: Surface, render: render, sampleState: sampleState, runSoFar: runSoFar, loopState: loopState,
        FORMAT: FORMAT, CONVERT: CONVERT, formatOf: formatOf, upgrade: upgrade,
        loadIcon: loadIcon, loopLength: loopLength, LOOP: { menu: LOOP_MENU, ended: LOOP_ENDED, clock: LOOP_CLOCK }, RUN: RUN, RUN_END: RUN_END, ITEMS: ITEMS, SCREENS: SCREENS, VIEWS: VIEWS, SAY: SAY,
        SCHEMA: SCHEMA, LAYOUTS: LAYOUTS, get: get, set: set, check: check, integer: integer, colour: colour
    };
    if (typeof module !== "undefined") module.exports = api;
    else window.SnxTheme = api;
})();
