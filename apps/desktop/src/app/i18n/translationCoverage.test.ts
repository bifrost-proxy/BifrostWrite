import fs from "node:fs";
import path from "node:path";
import * as ts from "typescript";
import { describe, expect, it } from "vitest";
import { CURATED_ZH_CN_TRANSLATIONS } from "./zh-CN.curated";
import { GENERATED_ZH_CN_TRANSLATIONS } from "./zh-CN.generated";
import { ZH_CN_TRANSLATIONS } from "./zh-CN";

const SOURCE_ROOT = path.resolve(process.cwd(), "src");
const TRANSLATION_KEYS = new Set([
    ...Object.keys(GENERATED_ZH_CN_TRANSLATIONS),
    ...Object.keys(CURATED_ZH_CN_TRANSLATIONS),
    ...Object.keys(ZH_CN_TRANSLATIONS),
]);

const VISIBLE_ATTRIBUTE_NAMES = new Set([
    "aria-label",
    "ariaLabel",
    "description",
    "emptySearchMessage",
    "label",
    "placeholder",
    "searchPlaceholder",
    "title",
]);

const ALLOWED_IMPERATIVE_TEXT = new Set([
    "@fetch",
    "/plan",
    "HTML",
    "NORMAL",
]);

function walkSourceFiles(directory: string): string[] {
    return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
        const target = path.join(directory, entry.name);
        if (entry.isDirectory()) {
            if (entry.name === "test") return [];
            return walkSourceFiles(target);
        }
        if (!/\.tsx?$/.test(entry.name)) return [];
        if (entry.name.includes(".test.") || entry.name.endsWith(".d.ts")) {
            return [];
        }
        return [target];
    });
}

function parseSource(file: string): ts.SourceFile {
    return ts.createSourceFile(
        file,
        fs.readFileSync(file, "utf8"),
        ts.ScriptTarget.Latest,
        true,
        file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
    );
}

function location(source: ts.SourceFile, node: ts.Node): string {
    const { line } = source.getLineAndCharacterOfPosition(node.getStart());
    return `${path.relative(SOURCE_ROOT, source.fileName)}:${line + 1}`;
}

describe("Simplified Chinese translation coverage", () => {
    it("has a dictionary entry for every static translate call", () => {
        const missing: string[] = [];

        for (const file of walkSourceFiles(SOURCE_ROOT)) {
            const source = parseSource(file);
            const visit = (node: ts.Node) => {
                if (
                    ts.isCallExpression(node) &&
                    ts.isIdentifier(node.expression) &&
                    node.expression.text === "translate" &&
                    node.arguments.length > 0
                ) {
                    const argument = node.arguments[0];
                    if (
                        (ts.isStringLiteral(argument) ||
                            ts.isNoSubstitutionTemplateLiteral(argument)) &&
                        !TRANSLATION_KEYS.has(argument.text)
                    ) {
                        missing.push(
                            `${location(source, argument)} ${JSON.stringify(argument.text)}`,
                        );
                    }
                }
                ts.forEachChild(node, visit);
            };
            visit(source);
        }

        expect(missing).toEqual([]);
    });

    it("does not leave literal English in common visible text positions", () => {
        const rawText: string[] = [];

        for (const file of walkSourceFiles(SOURCE_ROOT)) {
            const source = parseSource(file);
            const visit = (node: ts.Node) => {
                if (ts.isJsxText(node)) {
                    const value = node.text.replace(/\s+/g, " ").trim();
                    if (/[A-Za-z]{2}/.test(value)) {
                        rawText.push(
                            `${location(source, node)} JSX text ${JSON.stringify(value)}`,
                        );
                    }
                }

                if (
                    ts.isJsxAttribute(node) &&
                    VISIBLE_ATTRIBUTE_NAMES.has(node.name.getText(source)) &&
                    node.initializer &&
                    ts.isStringLiteral(node.initializer) &&
                    /[A-Za-z]{2}/.test(node.initializer.text)
                ) {
                    rawText.push(
                        `${location(source, node)} ${node.name.getText(source)}=${JSON.stringify(node.initializer.text)}`,
                    );
                }

                if (
                    ts.isBinaryExpression(node) &&
                    node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
                    ts.isPropertyAccessExpression(node.left) &&
                    ["placeholder", "textContent", "title"].includes(
                        node.left.name.text,
                    ) &&
                    (ts.isStringLiteral(node.right) ||
                        ts.isNoSubstitutionTemplateLiteral(node.right)) &&
                    /[A-Za-z]{2}/.test(node.right.text) &&
                    !ALLOWED_IMPERATIVE_TEXT.has(node.right.text) &&
                    node.left.expression.getText(source) !== "style"
                ) {
                    rawText.push(
                        `${location(source, node)} ${node.left.name.text}=${JSON.stringify(node.right.text)}`,
                    );
                }

                if (
                    ts.isCallExpression(node) &&
                    ts.isPropertyAccessExpression(node.expression) &&
                    node.expression.name.text === "setAttribute" &&
                    node.arguments.length > 1 &&
                    ts.isStringLiteral(node.arguments[0]) &&
                    ["aria-label", "placeholder", "title"].includes(
                        node.arguments[0].text,
                    ) &&
                    ts.isStringLiteral(node.arguments[1]) &&
                    /[A-Za-z]{2}/.test(node.arguments[1].text)
                ) {
                    rawText.push(
                        `${location(source, node)} ${node.arguments[0].text}=${JSON.stringify(node.arguments[1].text)}`,
                    );
                }

                ts.forEachChild(node, visit);
            };
            visit(source);
        }

        expect(rawText).toEqual([]);
    });
});
