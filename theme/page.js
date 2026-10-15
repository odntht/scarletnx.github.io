// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright 2026 the ScarletNX contributors
//
// The theme builder's page: the form built from builder.js's SCHEMA, the theme.ini kept two-way with it, the preview
// drawn by builder.js, the draft kept in this browser. No styles anywhere (the site's rule): plain elements only.
(function () {
    "use strict";
    var B = window.SnxTheme;
    var DRAFT = "scarletnx-theme-builder";
    function $(id) { return document.getElementById(id); }

    // what the page holds: the theme as the form has it (values as typed), the file's own extras, and the file
    var form = null, extras = { eret: {}, others: [] }, fields = [];
    var start = performance.now(), paused = 0, pausedAt = null;

    function status(message) { $("status").textContent = message; }
    function save() {
        try {
            localStorage.setItem(DRAFT, JSON.stringify({
                id: $("id").value, text: $("ini").value, view: $("view").value, scale: $("scale").value,
                phone: $("phone").checked
            }));
        } catch (e) {
            // a private window or blocked storage: the page works, the draft is not kept
        }
    }
    function load() {
        try {
            return JSON.parse(localStorage.getItem(DRAFT) || "null");
        } catch (e) {
            return null;
        }
    }

    // ---- the form ----

    function input(field, id) {
        var el;
        if (field.type === "choice") {
            el = document.createElement("select");
            field.words.forEach(function (w) {
                var o = document.createElement("option");
                o.value = o.textContent = w;
                el.appendChild(o);
            });
        } else {
            el = document.createElement("input");
            el.type = field.type === "flag" ? "checkbox" : field.type === "ms" ? "number" : "text";
            if (field.type === "ms") {
                el.min = 0;
                el.max = field.max || 10000;
                el.step = 1;
            }
            if (field.type === "text") el.size = 40;
            if (field.type === "color") el.size = 8;
        }
        el.id = id;
        return el;
    }
    function buildForm() {
        var root = $("form");
        B.SCHEMA.forEach(function (section) {
            var set = document.createElement("fieldset"), legend = document.createElement("legend");
            var about = document.createElement("p"), table = document.createElement("table"), rows = table.createTBody();
            legend.textContent = "[" + section.section + "]";
            about.textContent = section.about;
            set.appendChild(legend);
            set.appendChild(about);
            section.keys.forEach(function (field) {
                var row = rows.insertRow(), id = "key-" + section.section + "-" + field.key;
                var label = document.createElement("label"), el = input(field, id), note = document.createElement("small");
                var entry = { section: section.section, field: field, input: el, picker: null, note: note };
                label.htmlFor = id;
                label.textContent = field.key;
                row.insertCell().appendChild(label);
                var cell = row.insertCell();
                cell.appendChild(el);
                if (field.type === "color") {
                    // the system's colour picker beside the #RRGGBB text, kept the same
                    entry.picker = document.createElement("input");
                    entry.picker.type = "color";
                    entry.picker.title = field.key + ", picked";
                    entry.picker.setAttribute("aria-label", "[" + section.section + "] " + field.key + ", picked");
                    cell.appendChild(document.createTextNode(" "));
                    cell.appendChild(entry.picker);
                    entry.picker.addEventListener("input", function () {
                        el.value = entry.picker.value.toUpperCase();
                        fromForm();
                    });
                }
                row.insertCell().appendChild(note);
                el.addEventListener(field.type === "flag" || field.type === "choice" ? "change" : "input", fromForm);
                fields.push(entry);
            });
            set.appendChild(table);
            root.appendChild(set);
        });
    }
    function valueOf(entry) {
        var f = entry.field, el = entry.input;
        if (f.type === "flag") return el.checked;
        if (f.type === "choice") return f.values ? f.values[f.words.indexOf(el.value)] : el.value;
        if (f.type === "ms") {
            var n = B.integer(el.value);
            return n === null ? el.value : n;
        }
        return el.value;
    }
    function show(entry, value) {
        var f = entry.field, el = entry.input;
        if (f.type === "flag") el.checked = !!value;
        else if (f.type === "choice") el.value = f.values ? f.words[f.values.indexOf(value)] : value;
        else el.value = String(value);
        if (entry.picker && B.colour(el.value)) entry.picker.value = el.value.toLowerCase();
    }
    // the notes: what the menu makes of each value, and the [colors] the loading layout leaves to YoRHa
    function notes() {
        var loading = $("layout").value === "loading";
        $("base").disabled = loading; // the loading layout names no base: YoRHa
        fields.forEach(function (entry) {
            var c = B.check(entry.field, entry.input.type === "checkbox" ? "" : entry.input.value);
            var fixed = loading && entry.section === "colors";
            entry.input.disabled = fixed;
            if (entry.picker) entry.picker.disabled = fixed;
            entry.note.textContent = fixed ? "YoRHa's: the loading layout's [colors] are [run]'s"
                : entry.field.about + (c.note ? " (" + (c.ok ? "" : "not taken: ") + c.note + ")" : "");
        });
        var id = $("id").value, bad = /[\/\\:*?"<>|]/.test(id) || id[0] === "." || !id || B.utf8Length(id) >= 64;
        $("id-note").textContent = bad ? "a folder name under 64 bytes, not starting with a dot, without / \\ : * ? \" < > |"
            : "the folder: themes/" + id + "/theme.ini" +
              (id === "default" || id === "yorha" ? ", which replaces the built-in" : "");
    }

    // ---- two ways: the form writes the file, the file fills the form ----

    function write() {
        var base = $("layout").value === "loading" ? "yorha" : $("base").value;
        $("ini").value = B.serialize(form, { base: base, layout: $("layout").value, eret: extras.eret,
                                             others: extras.others });
    }
    function fromForm() {
        fields.forEach(function (entry) { B.set(form, entry.field.path, valueOf(entry)); });
        write();
        notes();
        save();
    }
    function fromText() {
        var text = $("ini").value, keys = B.fileKeys(text);
        form = B.parse(text, $("id").value);
        extras = { eret: keys.eret, others: keys.others };
        if (B.LAYOUTS.indexOf(keys.layout) >= 0) $("layout").value = keys.layout;
        $("base").value = keys.base === "yorha" || (!keys.base && (keys.layout === "menu" || keys.layout === "loading"))
            ? "yorha" : "default";
        fields.forEach(function (entry) { show(entry, B.get(form, entry.field.path)); });
        notes();
        save();
    }
    // a built-in to start from, the name and author kept
    function startFrom(id) {
        var t = B.builtin(id);
        t.name = form ? form.name : "My theme";
        t.author = form ? form.author : "";
        form = t;
        fields.forEach(function (entry) { show(entry, B.get(form, entry.field.path)); });
        write();
        notes();
        save();
    }

    // ---- the preview ----

    var surface = null, context = null, icon = new Image();
    // the program's icon, as the splash draws it
    icon.src = "https://raw.githubusercontent.com/scarletnx/ScarletNX/refs/heads/main/dist/icons/hicolor/128x128/apps/wimsy.png";
    function clock() { return (pausedAt === null ? performance.now() : pausedAt) - start - paused; }
    function frame() {
        var scale = Number($("scale").value), canvas = $("screen"), phone = $("phone").checked;
        if (!surface || surface.w !== 640 * scale) {
            canvas.width = 640 * scale;
            canvas.height = 400 * scale;
            surface = new B.Surface(640 * scale, 400 * scale);
            context = canvas.getContext("2d");
        }
        var t = B.parse($("ini").value, $("id").value), view = $("view").value, ms = Math.floor(clock()), s, now;
        if (view === "live") {
            var l = B.loopState(t, ms, phone);
            s = l.state;
            now = l.now;
        } else {
            s = B.sampleState(view, phone);
            now = 1000 + ms;
            // a run replays, from its first line to a second after its end
            if (view === "run" || view === "ask" || view === "aborting")
                s.runAt = now - (ms % (B.RUN_END + 1000));
        }
        s.scale = scale;
        var info = B.render(surface, t, s, now);
        context.putImageData(new ImageData(surface.px, surface.w, surface.h), 0, 0);
        if (info.icon && icon.complete && icon.naturalWidth)
            context.drawImage(icon, info.icon.x, info.icon.y, info.icon.size, info.icon.size);
    }
    var last = 0;
    function tick(time) {
        // about 30 frames a second, none while the tab is hidden
        if (!document.hidden && time - last >= 33) {
            last = time;
            frame();
        }
        window.requestAnimationFrame(tick);
    }

    // ---- the buttons ----

    function download() {
        var link = document.createElement("a");
        link.href = URL.createObjectURL(new Blob([$("ini").value], { type: "text/plain;charset=utf-8" }));
        link.download = "theme.ini";
        document.body.appendChild(link);
        link.click();
        link.remove();
        window.setTimeout(function () { URL.revokeObjectURL(link.href); }, 1000);
        status("Saved as theme.ini: put it in themes/" + $("id").value + "/.");
    }
    function copy() {
        var text = $("ini").value;
        function fallback() {
            $("ini").select();
            status(document.execCommand("copy") ? "Copied." : "Select the text below and copy it.");
        }
        if (navigator.clipboard && navigator.clipboard.writeText)
            navigator.clipboard.writeText(text).then(function () { status("Copied."); }, fallback);
        else fallback();
    }
    function open(event) {
        var file = event.target.files[0];
        if (!file) return;
        var reader = new FileReader();
        reader.onload = function () {
            // as bytes: the menu reads a byte order mark as the first line's
            $("ini").value = new TextDecoder("utf-8", { ignoreBOM: true }).decode(new Uint8Array(reader.result));
            fromText();
            status("Opened " + file.name + ".");
        };
        reader.onerror = function () { status("Could not read " + file.name + "."); };
        reader.readAsArrayBuffer(file);
    }

    function init() {
        if (!B) return;
        buildForm();
        var draft = load();
        if (draft && typeof draft.text === "string" && draft.text) {
            $("id").value = typeof draft.id === "string" ? draft.id : "mytheme";
            $("ini").value = draft.text;
            if (draft.view) $("view").value = draft.view;
            if (draft.scale) $("scale").value = draft.scale;
            $("phone").checked = !!draft.phone;
            fromText();
            status("The draft from this browser.");
        } else {
            // a window too narrow for 1280 pixels starts at 1x
            if (window.innerWidth < 1320) $("scale").value = "1";
            startFrom("default");
        }
        $("ini").addEventListener("input", fromText);
        $("id").addEventListener("input", function () { notes(); save(); });
        $("base").addEventListener("change", function () { startFrom($("base").value); });
        $("layout").addEventListener("change", function () {
            if ($("layout").value === "loading") {
                // the menus keep YoRHa's colours: the form shows them
                $("base").value = "yorha";
                form.colors = B.builtin("yorha").colors;
                fields.forEach(function (entry) {
                    if (entry.section === "colors") show(entry, B.get(form, entry.field.path));
                });
            }
            write();
            notes();
            save();
        });
        ["view", "scale", "phone"].forEach(function (id) { $(id).addEventListener("change", save); });
        $("play").addEventListener("change", function () {
            if ($("play").checked && pausedAt !== null) {
                paused += performance.now() - pausedAt;
                pausedAt = null;
            } else if (!$("play").checked) pausedAt = performance.now();
        });
        $("download").addEventListener("click", download);
        $("copy").addEventListener("click", copy);
        $("open").addEventListener("change", open);
        window.requestAnimationFrame(tick);
    }
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
    else init();
})();
