import { builtinModules } from 'node:module';
import { realpathSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import ts from 'typescript';
import type { Plugin } from 'vite';

const serverPackages = ['@modelcontextprotocol/client', '@modelcontextprotocol/server', '@modelcontextprotocol/node', '@modelcontextprotocol/ext-apps/server', 'hono', '@hono/node-server'];
const nodeModules = new Set(builtinModules.flatMap(name => [name, `node:${name}`]));
const networkApis = new Set(['fetch', 'XMLHttpRequest', 'WebSocket', 'EventSource', 'sendBeacon']);
const viteFlags = new Set(['DEV', 'PROD', 'MODE', 'BASE_URL', 'SSR']);
function propertyName(node: ts.Node): string | undefined {
  if (ts.isPropertyAccessExpression(node)) return node.name.text;
  if (ts.isElementAccessExpression(node) && ts.isStringLiteralLike(node.argumentExpression)) return node.argumentExpression.text;
  return undefined;
}

// Runs on the modules Vite actually reaches from widget.html, before transpilation.
// The separate development preview can still make MCP HTTP requests.
export function widgetBoundary(projectRoot: string): Plugin {
  projectRoot = realpathSync(projectRoot);
  return {
    name: 'mot-lens-widget-boundary', apply: 'build', enforce: 'pre',
    configResolved(config) {
      const input = config.build.rollupOptions.input;
      if (typeof input !== 'string' || resolve(config.root, input) !== resolve(projectRoot, 'apps/mcp-ui/widget.html')) {
        throw new Error(`MOT Lens production input must be only apps/mcp-ui/widget.html; keep index.html and the preview host in development. Received ${JSON.stringify(input)} in ${config.root}.`);
      }
    },
    transform(code, id) {
      if (id.startsWith('\0')) return;
      const path = relative(projectRoot, id.split('?')[0]!).replaceAll('\\', '/');
      if (path.startsWith('../') || path.includes('node_modules/')) return;
      if (path.startsWith('apps/mcp/') || /^apps\/mcp-ui\/src\/preview\.(tsx|css)$/.test(path)) {
        this.error(`${path} is server-only or development-only. Import the shared domain/UI contract and use App.callServerTool for lookups.`);
      }
      if (!/\.[cm]?[jt]sx?$/.test(path)) return;
      const source = ts.createSourceFile(path, code, ts.ScriptTarget.Latest, true);
      const reject = (node: ts.Node, message: string): never => {
        const position = source.getLineAndCharacterOfPosition(node.getStart(source));
        return this.error(`${path}:${position.line + 1}:${position.character + 1}: ${message}`);
      };
      const checkImport = (node: ts.Node, specifier: ts.Expression) => {
        if (!ts.isStringLiteralLike(specifier)) return reject(node, 'Use a static module specifier so the production dependency boundary can be checked.');
        const name = specifier.text;
        if (name.startsWith('node:') || name.startsWith('cloudflare:') || nodeModules.has(name) || serverPackages.some(pkg => name === pkg || name.startsWith(`${pkg}/`))) {
          reject(node, `Server import ${JSON.stringify(name)} cannot ship in widget.html. Keep HTTP/OAuth and credentials in apps/mcp; use App.callServerTool.`);
        }
      };
      const visit = (node: ts.Node) => {
        // Type-only declarations/references are erased and cannot make requests
        // or pull server code into the widget's runtime dependency graph.
        if (ts.isImportDeclaration(node)) {
          const clause = node.importClause; const bindings = clause?.namedBindings;
          if (clause?.isTypeOnly || !clause?.name && bindings && ts.isNamedImports(bindings) && bindings.elements.length > 0 && bindings.elements.every(item => item.isTypeOnly)) return;
        }
        if (ts.isExportDeclaration(node)) {
          const clause = node.exportClause;
          if (node.isTypeOnly || clause && ts.isNamedExports(clause) && clause.elements.length > 0 && clause.elements.every(item => item.isTypeOnly)) return;
        }
        if (ts.isTypeNode(node) || ts.isInterfaceDeclaration(node) || ts.isTypeAliasDeclaration(node) ||
          ts.isImportSpecifier(node) && node.isTypeOnly || ts.isExportSpecifier(node) && node.isTypeOnly) return;
        if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier) checkImport(node, node.moduleSpecifier);
        if (ts.isCallExpression(node) && (node.expression.kind === ts.SyntaxKind.ImportKeyword || ts.isIdentifier(node.expression) && node.expression.text === 'require')) {
          const specifier = node.arguments[0];
          if (!specifier) return reject(node, 'A production import needs a static module specifier.');
          checkImport(node, specifier);
        }
        const name = propertyName(node);
        if (name === 'env' && (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node))) {
          const receiver = node.expression;
          const isProcess = ts.isIdentifier(receiver) && receiver.text === 'process';
          const isImportMeta = ts.isMetaProperty(receiver) && receiver.keywordToken === ts.SyntaxKind.ImportKeyword;
          if (isProcess || isImportMeta && !viteFlags.has(propertyName(node.parent) ?? '')) {
            reject(node, 'Server environment values cannot ship in widget.html. Read credentials/configuration in apps/mcp; only Vite built-in flags are allowed here.');
          }
        }
        // Inspect references, including aliases and literal bracket access, not text
        // in comments/defect strings. The MCP App bridge remains the request path.
        const isKey = ts.isIdentifier(node) && (
          ts.isPropertyAccessExpression(node.parent) && node.parent.name === node ||
          ts.isPropertyAssignment(node.parent) && node.parent.name === node ||
          ts.isMethodDeclaration(node.parent) && node.parent.name === node
        );
        if (name && networkApis.has(name) || ts.isIdentifier(node) && networkApis.has(node.text) && !isKey) {
          reject(node, 'Direct browser network APIs cannot ship in widget.html. Keep HTTP/OAuth/API requests in apps/mcp and use App.callServerTool.');
        }
        ts.forEachChild(node, visit);
      };
      visit(source);
    },
  };
}
