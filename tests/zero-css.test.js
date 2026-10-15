// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright 2026 the ScarletNX contributors
//
// tools/zero-css.js refuses each way of styling, and passes the site as it is. The cases are built from pieces, so
// this file holds none of what the checker looks for.
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const CHECKER = path.join(__dirname, "..", "tools", "zero-css.js");
const S = "sty" + "le";
function check(name, content) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "zero-css-"));
    const file = path.join(dir, name);
    fs.writeFileSync(file, content);
    const run = spawnSync(process.execPath, [CHECKER, file], { encoding: "utf8" });
    fs.rmSync(dir, { recursive: true });
    return run;
}
const REFUSED = [
    ["a.html", "<p>x</p><" + S + ">p { color: red }</" + S + ">", "<" + S + ">"],
    ["b.html", "<p " + S + "=\"color: red\">x</p>", S + " attribute"],
    ["c.html", "<p\n  " + S.toUpperCase() + " = 'color: red'>x</p>", S + " attribute"],
    ["d.html", "<link href=\"x.css\" rel=\"" + S + "sheet\">", S + "sheet link"],
    ["e.html", "<link rel=" + S + "sheet href=x.css>", S + "sheet link"],
    ["f.svg", "<?xml-" + S + "sheet href=\"x.css\"?><svg></svg>", "xml-" + S + "sheet"],
    ["g.css", "p { color: red }", S + "sheet file"],
    ["h.js", "document.body." + S + ".color = 'red';", "." + S],
    ["i.js", "el." + S + "Sheets;", S + "Sheets"],
    ["j.js", "el." + S + ".css" + "Text = '';", "css" + "Text"],
    ["k.js", "sheet.insert" + "Rule('p {}');", "insert" + "Rule"],
    ["l.js", "new CSS" + "Style" + "Sheet();", "CSS" + "Style" + "Sheet"],
    ["m.js", "document.adopted" + "Style" + "Sheets = [];", "adopted" + "Style" + "Sheets"],
    ["n.js", "el.setAttribute('" + S + "', 'color: red');", "setAttribute"],
    ["o.js", "document.createElement(\"" + S + "\");", "createElement"],
    ["p.js", "el[\"" + S + "\"].color = 'red';", "inline " + S],
    ["q.html", "<script>document.body." + S + ".margin = 0;</script>", "." + S],
    ["r.mjs", "link.rel = '" + S + "sheet';", S + "sheet"]
];

REFUSED.forEach(function (c) {
    test("refuses " + c[2] + " (" + c[0] + ")", function () {
        const run = check(c[0], c[1]);
        assert.equal(run.status, 1, run.stdout + run.stderr);
        assert.ok(run.stderr.indexOf(c[2]) >= 0, run.stderr);
        assert.match(run.stderr, /no CSS/);
    });
});

test("takes plain HTML and a canvas script", function () {
    assert.equal(check("ok.html", "<center><table><tbody><tr><td>[head] " + S + " = bar</td></tr></tbody></table>" +
                       "</center>").status, 0);
    assert.equal(check("ok.js", "ctx.fillRect(0, 0, 1, 1); kv(\"" + S + "\", t.head); el.hidden = true;").status, 0);
});

test("the site has no CSS", function () {
    const run = spawnSync(process.execPath, [CHECKER], { cwd: path.join(__dirname, ".."), encoding: "utf8" });
    assert.equal(run.status, 0, run.stderr);
});
