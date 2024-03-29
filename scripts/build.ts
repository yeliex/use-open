#!/usr/bin/env TS_NODE_PROJECT=null node --import swc-register-esm

import { parse, transform } from '@swc/core';
import glob from 'fast-glob';
import { existsSync, statSync } from 'node:fs';
import { copyFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { basename, dirname, extname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const CWD = resolve(fileURLToPath(import.meta.url), '..', '..');

const START = Date.now();

const SWC_OPTIONS = {
    sourceMaps: false,
    jsc: {
        parser: {
            syntax: 'typescript' as const,
            tsx: true,
            decorators: true,
            dynamicImport: true,
        },
        externalHelpers: true,
        target: 'es2022' as const,
        keepClassNames: true,
    },
};

const PACKAGE_JSON_PATH = resolve(CWD, 'package.json');

if (!existsSync(PACKAGE_JSON_PATH)) {
    console.error('package.json is not a file');
    process.exit(1);
}

const OUT_DIR = resolve(CWD, 'dist');

await rm(OUT_DIR, { recursive: true, force: true });
await mkdir(OUT_DIR, { recursive: true });

const SRC_ROOT = resolve(CWD, 'src');
const files = (await glob('**/*.ts', {
    onlyFiles: true,
    dot: false,
    cwd: SRC_ROOT,
    absolute: false,
}));

const ERRORS: Array<{
    path: string;
    message: string;
}> = [];
const COPY_FILES: Array<{
    relative: string;
    absolute: string;
}> = [];
const COMPILE_FILES: Array<{
    relative: string;
    absolute: string;
}> = [];

const AVAILABLE_EXT_REGEXP = /(?<!\.d)\.tsx?$/g;

for (const relativePath of files) {
    const path = resolve(SRC_ROOT, relativePath);

    if (!existsSync(path) || !statSync(path).isFile()) {
        ERRORS.push({
            path: relativePath,
            message: 'File does not exist or not a file',
        });

        continue;
    }

    if (!relativePath.match(AVAILABLE_EXT_REGEXP)) {
        COPY_FILES.push({
            relative: relativePath,
            absolute: path,
        });

        continue;
    }

    COMPILE_FILES.push({
        relative: relativePath,
        absolute: path,
    });
}

const tsconfig = ts.readConfigFile(resolve(CWD, 'tsconfig.json'), ts.sys.readFile);
const parsedTsConfig = ts.parseJsonConfigFileContent(tsconfig.config, ts.sys, CWD);
const tsHost = ts.createCompilerHost(parsedTsConfig.options);
const tsModuleResolutionCache = ts.createModuleResolutionCache(ts.sys.getCurrentDirectory(), (x) => x, tsconfig.config);

const tsProgram = ts.createProgram({
    rootNames: COMPILE_FILES.map(item => item.absolute),
    options: {
        ...parsedTsConfig.options,
        outDir: OUT_DIR,
        declaration: true,
        emitDeclarationOnly: true,
    },
    host: tsHost,
});

const tsEmitResult = tsProgram.emit();

const allDiagnostics = ts.getPreEmitDiagnostics(tsProgram).concat(tsEmitResult.diagnostics);

allDiagnostics.forEach(diagnostic => {
    if (diagnostic.file) {
        let { line, character } = ts.getLineAndCharacterOfPosition(diagnostic.file, diagnostic.start!);
        let message = ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n');
        console.log(`${relative(CWD, diagnostic.file.fileName)} (${line + 1},${character + 1}):\n ${message}\n`);
    } else {
        console.log(ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'));
    }
});

for (const { relative: relativePath, absolute: absolutePath } of COMPILE_FILES) {
    const source = await readFile(absolutePath, 'utf-8');

    const outputBase = resolve(
        OUT_DIR,
        dirname(relativePath),
        basename(relativePath, extname(relativePath)),
    );

    try {
        const ast = await parse(source, {
            ...SWC_OPTIONS.jsc.parser,
        });

        const { code: esm } = await transform(ast, {
            ...SWC_OPTIONS,
            module: {
                type: 'es6',
            },
        });

        await writeFile(`${outputBase}.js`, esm, 'utf-8');

        // transform js import to cjs
        for (const item of ast.body) {
            if ('source' in item && item.source) {
                const { value } = item.source;

                const { resolvedModule } = ts.resolveModuleName(
                    value,
                    absolutePath,
                    parsedTsConfig.options,
                    tsHost,
                    tsModuleResolutionCache,
                );

                if (resolvedModule && resolvedModule.resolvedFileName.startsWith(SRC_ROOT)) {
                    const ext = extname(item.source.value);

                    item.source.value = ext ? value.replace(/\.[tj]sx?$/, '.cjs') :
                        resolvedModule.resolvedFileName.match(/\/index\.[tj]sx?$/)
                            ? `${value}/index.cjs`
                            : `${value}.cjs`;
                }
            }
        }


        const { code: commonJs } = await transform(ast, {
            ...SWC_OPTIONS,
            module: {
                type: 'commonjs',
            },
        });

        await writeFile(`${outputBase}.cjs`, commonJs, 'utf-8');
    } catch (e) {
        console.log(`${relativePath} (0,0):${e instanceof Error ? e.message : e}`);
    }
}

for (const { relative: relativePath, absolute: absolutePath } of COPY_FILES) {
    await copyFile(absolutePath, resolve(OUT_DIR, relativePath));
}

console.log(`Compiled ${COMPILE_FILES.length} files, copied ${COPY_FILES.length} files in ${Date.now() - START}ms`);
