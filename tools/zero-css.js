#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright 2026 the ScarletNX contributors
//
// The site has no CSS at all (Lizzie's rule): no <style>, no style attributes, no stylesheet links, no CSS files, and
// no script that styles (.style, cssText, insertRule, CSSStyleSheet, adoptedStyleSheets and the like). Layout is plain
// HTML (table, center, fieldset, br), drawing is a <canvas>.
//
//   node tools/zero-css.js [FILE...]    every file git has (tracked, or new and not ignored) when none is named
//
// Exits 1 listing each place that breaks the rule. This file names the patterns, so it skips itself.
"use strict";
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const SELF = path.resolve(__filename);
const STYLE_FILES = /\.(css|scss|sass|less|styl)$/i;
const MARKUP = /\.(html?|xhtml|svg|xml)$/i;
const SCRIPT = /\.(js|mjs|cjs)$/i;
// what a script may not do: style an element, write or load a stylesheet
const SCRIPT_RULES = [
    [/\.style\b/, ".style (an element's inline style)"],
    [/\[\s*["'`]style["'`]\s*\]/, "[\"style\"] (an element's inline style)"],
    [/\bcssText\b/, "cssText"],
    [/\binsertRule\b/, "insertRule"],
    [/\bCSSStyleSheet\b/, "CSSStyleSheet"],
    [/\badoptedStyleSheets\b/, "adoptedStyleSheets"],
    [/\bstyleSheets\b/, "styleSheets"],
    [/\battributeStyleMap\b/, "attributeStyleMap"],
    [/setAttribute(NS)?\s*\([^)]*["'`]style["'`]/, "setAttribute(\"style\")"],
    [/createElement(NS)?\s*\([^)]*["'`]style["'`]/, "createElement(\"style\")"],
    [/stylesheet/i, "a stylesheet"]
];

function files() {
    const args = process.argv.slice(2);
    if (args.length) return args;
    try {
        return execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "-z"], { encoding: "utf8" })
            .split("\0").filter(Boolean);
    } catch (e) {
        // no git: the whole tree but .git and node_modules
        const out = [];
        (function walk(dir) {
            fs.readdirSync(dir, { withFileTypes: true }).forEach(function (d) {
                const p = path.join(dir, d.name);
                if (d.isDirectory()) { if (d.name !== ".git" && d.name !== "node_modules") walk(p); }
                else out.push(p);
            });
        })(".");
        return out;
    }
}
function lineOf(text, index) { return text.slice(0, index).split("\n").length; }

const problems = [];
function scanScript(file, text, offset, whole) {
    SCRIPT_RULES.forEach(function (rule) {
        const re = new RegExp(rule[0].source, rule[0].flags + "g");
        let m;
        while ((m = re.exec(text))) problems.push(file + ":" + lineOf(whole, offset + m.index) + ": " + rule[1]);
    });
}
function scanMarkup(file, text) {
    let m;
    const tags = /<(?!!--)[!?]?[a-zA-Z][^>]*>/g;
    while ((m = tags.exec(text))) {
        const tag = m[0], at = lineOf(text, m.index);
        if (/^<style\b/i.test(tag)) problems.push(file + ":" + at + ": a <style> element");
        if (/\sstyle\s*=/i.test(tag)) problems.push(file + ":" + at + ": a style attribute");
        if (/^<link\b/i.test(tag) && /\brel\s*=\s*["']?[^"'>]*stylesheet/i.test(tag))
            problems.push(file + ":" + at + ": a stylesheet link");
        if (/^<\?xml-stylesheet\b/i.test(tag)) problems.push(file + ":" + at + ": an xml-stylesheet");
    }
    // the scripts in the page are scripts too
    const scripts = /<script\b[^>]*>([\s\S]*?)<\/script>/gi;
    while ((m = scripts.exec(text))) scanScript(file, m[1], m.index + m[0].indexOf(">") + 1, text);
}

files().forEach(function (file) {
    if (path.resolve(file) === SELF || !fs.existsSync(file) || !fs.statSync(file).isFile()) return;
    if (STYLE_FILES.test(file)) {
        problems.push(file + ": a stylesheet file");
        return;
    }
    if (!MARKUP.test(file) && !SCRIPT.test(file)) return;
    const text = fs.readFileSync(file, "utf8");
    if (MARKUP.test(file)) scanMarkup(file, text);
    else scanScript(file, text, 0, text);
});
if (problems.length) {
    console.error(problems.join("\n"));
    console.error("\nThe site has no CSS (Lizzie's rule): lay pages out with plain HTML (table, center, fieldset, br) and " +
                  "draw with a <canvas>; no <style>, style attributes, stylesheets or scripts that style. " +
                  "tools/zero-css.js lists what it refuses.");
    process.exit(1);
}
console.log("zero CSS: no styles in " + files().length + " files");
