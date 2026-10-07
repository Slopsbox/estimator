// @vitest-environment node
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import ts from 'typescript';
import { expect, it } from 'vitest';

it('typechecks deployed API entrypoints using the nearest tsconfig, as Vercel does', () => {
  const root = fileURLToPath(new URL('../../', import.meta.url));
  const configPath = ts.findConfigFile(path.join(root, 'api'), ts.sys.fileExists);
  expect(configPath).toBe(path.join(root, 'api/tsconfig.json'));
  const config = ts.readConfigFile(configPath!, ts.sys.readFile);
  const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, path.dirname(configPath!));
  expect(parsed.options.module).toBe(ts.ModuleKind.NodeNext);
  expect(parsed.options.moduleResolution).toBe(ts.ModuleResolutionKind.NodeNext);
  expect(parsed.options.lib).toContain('lib.es2022.d.ts');
  const program = ts.createProgram({
    rootNames: ['api/health-check-download.ts', 'api/verify-turnstile.ts'].map(p => path.join(root, p)),
    options: { ...parsed.options, noEmit: true },
  });
  const diagnostics = [...parsed.errors, ...ts.getPreEmitDiagnostics(program)];
  expect(diagnostics.map(d => `${d.code}: ${ts.flattenDiagnosticMessageText(d.messageText, '\n')}`)).toEqual([]);
}, 20000);
