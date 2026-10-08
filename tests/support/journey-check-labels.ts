import ts from 'typescript';

// Issue #652: a check label reaches the hosted log, so a runner may build one only from code: literals, loop indices,
// module constants, and the label parameters of its own helpers. This reads a runner's source and names every label
// argument built from anything else — a value read from the page, the product, or the manuscript.

const LABEL = /^[a-z0-9][a-z0-9-]{0,95}$/u;
const PART = /^[a-z0-9-]*$/u;

type FunctionNode = ts.FunctionDeclaration | ts.FunctionExpression | ts.ArrowFunction | ts.MethodDeclaration;

function walk(node: ts.Node, visit: (node: ts.Node) => void): void {
  visit(node);
  ts.forEachChild(node, (child) => {
    walk(child, visit);
  });
}

function isFunction(node: ts.Node): node is FunctionNode {
  return ts.isFunctionDeclaration(node) || ts.isFunctionExpression(node) || ts.isArrowFunction(node) || ts.isMethodDeclaration(node);
}

function functionName(fn: FunctionNode): string | null {
  if (ts.isFunctionDeclaration(fn)) return fn.name?.text ?? null;
  if ((ts.isArrowFunction(fn) || ts.isFunctionExpression(fn)) && ts.isVariableDeclaration(fn.parent) && ts.isIdentifier(fn.parent.name)) {
    return fn.parent.name.text;
  }
  return null;
}

function parameterNames(fn: FunctionNode): Array<string | null> {
  return fn.parameters.map((parameter) => (ts.isIdentifier(parameter.name) ? parameter.name.text : null));
}

function calleeName(call: ts.CallExpression): string | null {
  return ts.isIdentifier(call.expression) ? call.expression.text : null;
}

/** Which argument of which function in the file becomes a check label: journeyCheckFailure's second, then outward. */
function labelHelpers(source: ts.SourceFile): Map<string, Set<number>> {
  const helpers = new Map<string, Set<number>>([['journeyCheckFailure', new Set([1])]]);
  const functions: FunctionNode[] = [];
  walk(source, (node) => {
    if (isFunction(node) && functionName(node) !== null) functions.push(node);
  });
  for (let changed = true; changed;) {
    changed = false;
    for (const fn of functions) {
      const name = functionName(fn) as string;
      const names = parameterNames(fn);
      walk(fn.body ?? fn, (node) => {
        if (!ts.isCallExpression(node)) return;
        for (const index of helpers.get(calleeName(node) ?? '') ?? []) {
          const argument = node.arguments[index];
          if (argument === undefined) continue;
          walk(argument, (identifier) => {
            if (!ts.isIdentifier(identifier)) return;
            const at = names.indexOf(identifier.text);
            if (at < 0) return;
            const set = helpers.get(name) ?? new Set<number>();
            if (!set.has(at)) {
              set.add(at);
              helpers.set(name, set);
              changed = true;
            }
          });
        }
      });
    }
  }
  return helpers;
}

type Declaration =
  | { kind: 'parameter'; fn: FunctionNode; index: number }
  | { kind: 'loop-index' }
  | { kind: 'loop-element'; loop: ts.ForOfStatement; binding: ts.BindingName; path: Array<number | string> }
  | { kind: 'variable'; declaration: ts.VariableDeclaration; constant: boolean; module: boolean; path: Array<number | string> }
  | { kind: 'unknown' };

/** Where `name` sits inside a binding pattern, as the element indices and property names that lead to it. */
function bindingPath(binding: ts.BindingName, name: string): Array<number | string> | null {
  if (ts.isIdentifier(binding)) return binding.text === name ? [] : null;
  for (const [index, element] of binding.elements.entries()) {
    if (ts.isOmittedExpression(element)) continue;
    const inner = bindingPath(element.name, name);
    if (inner === null) continue;
    if (ts.isArrayBindingPattern(binding)) return [index, ...inner];
    const key = element.propertyName ?? element.name;
    return [ts.isIdentifier(key) ? key.text : '?', ...inner];
  }
  return null;
}

function declarationOf(use: ts.Node, name: string): Declaration {
  for (let scope: ts.Node | undefined = use.parent; scope !== undefined; scope = scope.parent) {
    if (isFunction(scope)) {
      const index = parameterNames(scope).indexOf(name);
      if (index >= 0) return { kind: 'parameter', fn: scope, index };
      for (const parameter of scope.parameters) {
        if (!ts.isIdentifier(parameter.name) && bindingPath(parameter.name, name) !== null) return { kind: 'unknown' };
      }
    }
    if ((ts.isForStatement(scope) || ts.isForOfStatement(scope) || ts.isForInStatement(scope)) &&
      scope.initializer !== undefined && ts.isVariableDeclarationList(scope.initializer)) {
      for (const declaration of scope.initializer.declarations) {
        const path = bindingPath(declaration.name, name);
        if (path === null) continue;
        if (ts.isForStatement(scope)) return { kind: 'loop-index' };
        if (ts.isForOfStatement(scope)) return { kind: 'loop-element', loop: scope, binding: declaration.name, path };
        return { kind: 'unknown' };
      }
    }
    const statements = ts.isBlock(scope) || ts.isSourceFile(scope) || ts.isCaseClause(scope) || ts.isDefaultClause(scope) ? scope.statements : null;
    if (statements === null) continue;
    for (const statement of statements) {
      if (!ts.isVariableStatement(statement)) continue;
      for (const declaration of statement.declarationList.declarations) {
        const path = bindingPath(declaration.name, name);
        if (path === null) continue;
        return {
          kind: 'variable',
          declaration,
          constant: (statement.declarationList.flags & ts.NodeFlags.Const) !== 0,
          module: ts.isSourceFile(scope),
          path,
        };
      }
    }
  }
  return { kind: 'unknown' };
}

class LabelReader {
  private readonly seen = new Set<ts.Node>();

  constructor(
    private readonly source: ts.SourceFile,
    private readonly helpers: Map<string, Set<number>>,
  ) {}

  /** Why `expression`, used as a whole label or as a part of one, is not built from code alone; `null` when it is. */
  refuse(expression: ts.Expression, whole: boolean): string | null {
    if (ts.isParenthesizedExpression(expression) || ts.isAwaitExpression(expression)) return this.refuse(expression.expression, whole);
    if (ts.isStringLiteral(expression) || ts.isNoSubstitutionTemplateLiteral(expression)) {
      return (whole ? LABEL : PART).test(expression.text) ? null : `the text ${JSON.stringify(expression.text)}`;
    }
    if (ts.isNumericLiteral(expression)) return whole ? 'a bare number' : null;
    if (ts.isTemplateExpression(expression)) {
      const parts = [expression.head.text, ...expression.templateSpans.map((span) => span.literal.text)];
      if (!parts.every((part) => PART.test(part))) return `the template text of ${expression.getText(this.source)}`;
      for (const span of expression.templateSpans) {
        const why = this.refuse(span.expression, false);
        if (why !== null) return why;
      }
      return null;
    }
    if (ts.isConditionalExpression(expression)) return this.refuse(expression.whenTrue, whole) ?? this.refuse(expression.whenFalse, whole);
    if (!whole && ts.isBinaryExpression(expression) &&
      [ts.SyntaxKind.PlusToken, ts.SyntaxKind.MinusToken, ts.SyntaxKind.AsteriskToken].includes(expression.operatorToken.kind)) {
      return this.refuse(expression.left, false) ?? this.refuse(expression.right, false);
    }
    if (ts.isIdentifier(expression)) return this.refuseIdentifier(expression, whole);
    // A number can carry no text: as part of a label, a value coerced by Number() is admitted whatever it was read from.
    if (!whole && ts.isCallExpression(expression) && calleeName(expression) === 'Number' && expression.arguments.length === 1) return null;
    if (ts.isCallExpression(expression)) return this.refuseCall(expression);
    return `${expression.getText(this.source).slice(0, 80)}, which is not built from code alone`;
  }

  private refuseIdentifier(identifier: ts.Identifier, whole: boolean): string | null {
    const found = declarationOf(identifier, identifier.text);
    const name = identifier.text;
    switch (found.kind) {
      case 'parameter':
        // A helper's own label parameter: every call to that helper is read on its own.
        return this.helpers.get(functionName(found.fn) ?? '')?.has(found.index) === true ? null : `${name}, a parameter that is not a label`;
      case 'loop-index':
        return null;
      case 'loop-element':
        return this.refuseElements(found.loop.expression, found.path, `${name}, from a loop over ${found.loop.expression.getText(this.source).slice(0, 60)}`);
      case 'variable': {
        if (this.seen.has(found.declaration)) return null;
        this.seen.add(found.declaration);
        if (found.path.length === 0 && this.isCounter(found.declaration)) return null;
        if (found.path.length === 0 && found.module && this.isStageVariable(found.declaration)) return null;
        if (!found.constant || found.declaration.initializer === undefined) return `${name}, a variable that is not a constant`;
        if (found.path.length === 0) {
          const why = this.refuse(found.declaration.initializer, whole);
          return why === null ? null : `${name} = ${why}`;
        }
        if (typeof found.path[0] === 'string' && found.path.length === 1) return this.refuseProperty(found.path[0]);
        return this.refuseElements(found.declaration.initializer, found.path, `${name}, destructured from ${found.declaration.initializer.getText(this.source).slice(0, 60)}`);
      }
      default:
        if (this.isDestructuredParameter(identifier)) return this.refuseProperty(name);
        return `${name}, which is not a literal, loop index, constant or label parameter`;
    }
  }

  /** A value destructured from a function's object parameter: every object in the file that gives that property. */
  private isDestructuredParameter(identifier: ts.Identifier): boolean {
    for (let scope: ts.Node | undefined = identifier.parent; scope !== undefined; scope = scope.parent) {
      if (isFunction(scope)) {
        return scope.parameters.some((parameter) => ts.isObjectBindingPattern(parameter.name) && bindingPath(parameter.name, identifier.text)?.length === 1);
      }
    }
    return false;
  }

  /** Every place this file gives property `name` a value — object literals and binding defaults — built from code. */
  private refuseProperty(name: string): string | null {
    let why: string | null = null;
    walk(this.source, (node) => {
      if (why !== null) return;
      if (ts.isPropertyAssignment(node) && ts.isIdentifier(node.name) && node.name.text === name) {
        why = this.refuse(node.initializer, false);
      } else if (ts.isShorthandPropertyAssignment(node) && node.name.text === name) {
        why = this.refuse(node.name, false);
      } else if (ts.isBindingElement(node) && node.initializer !== undefined && ts.isIdentifier(node.name) && node.name.text === name &&
        ts.isObjectBindingPattern(node.parent)) {
        why = this.refuse(node.initializer, false);
      }
    });
    return why === null ? null : `property ${name}: ${why}`;
  }

  /** The values a binding path takes over a constant list: an array literal, or a constant that names one. */
  private refuseElements(list: ts.Expression, path: Array<number | string>, context: string): string | null {
    const literal = this.listLiteral(list);
    if (literal === null) return context;
    for (const element of literal.elements) {
      const value = this.select(element, path);
      if (value === null) return context;
      const why = this.refuse(value, false);
      if (why !== null) return `${context}: ${why}`;
    }
    return null;
  }

  private listLiteral(list: ts.Expression): ts.ArrayLiteralExpression | null {
    if (ts.isArrayLiteralExpression(list)) return list;
    if (ts.isCallExpression(list) && ts.isPropertyAccessExpression(list.expression) && list.expression.name.text === 'freeze' && list.arguments[0] !== undefined) {
      return this.listLiteral(list.arguments[0]);
    }
    if (ts.isIdentifier(list)) {
      const found = declarationOf(list, list.text);
      if (found.kind === 'variable' && found.constant && found.path.length === 0 && found.declaration.initializer !== undefined) {
        return this.listLiteral(found.declaration.initializer);
      }
    }
    return null;
  }

  private select(element: ts.Expression, path: Array<number | string>): ts.Expression | null {
    let value: ts.Expression = element;
    for (const step of path) {
      if (typeof step === 'number') {
        if (!ts.isArrayLiteralExpression(value)) return null;
        const next = value.elements[step];
        if (next === undefined || ts.isSpreadElement(next)) return null;
        value = next;
      } else {
        if (!ts.isObjectLiteralExpression(value)) return null;
        const property = value.properties.find((item) => item.name !== undefined && ts.isIdentifier(item.name) && item.name.text === step);
        if (property === undefined) return null;
        if (ts.isPropertyAssignment(property)) value = property.initializer;
        else if (ts.isShorthandPropertyAssignment(property)) value = property.name;
        else return null;
      }
    }
    return value;
  }

  /** A `let` that starts as a number and only ever counts: a loop index kept outside a `for`. */
  private isCounter(declaration: ts.VariableDeclaration): boolean {
    if (declaration.initializer === undefined || !ts.isNumericLiteral(declaration.initializer)) return false;
    return this.writes(declaration).every((write) =>
      ts.isPrefixUnaryExpression(write) || ts.isPostfixUnaryExpression(write) ||
      (ts.isBinaryExpression(write) && write.operatorToken.kind !== ts.SyntaxKind.EqualsToken) ||
      (ts.isBinaryExpression(write) && this.refuse(write.right, false) === null));
  }

  /** The module's stage variable: written only by `at()`, whose every argument the location tests admit. */
  private isStageVariable(declaration: ts.VariableDeclaration): boolean {
    if (declaration.initializer === undefined || !ts.isStringLiteral(declaration.initializer)) return false;
    const writes = this.writes(declaration);
    return writes.length > 0 && writes.every((write) => {
      for (let scope: ts.Node | undefined = write.parent; scope !== undefined; scope = scope.parent) {
        if (isFunction(scope)) return functionName(scope) === 'at';
      }
      return false;
    });
  }

  private writes(declaration: ts.VariableDeclaration): ts.Expression[] {
    const name = ts.isIdentifier(declaration.name) ? declaration.name.text : null;
    const writes: ts.Expression[] = [];
    walk(this.source, (node) => {
      const target = ts.isBinaryExpression(node) && node.operatorToken.kind >= ts.SyntaxKind.FirstAssignment &&
        node.operatorToken.kind <= ts.SyntaxKind.LastAssignment ? node.left
        : (ts.isPrefixUnaryExpression(node) || ts.isPostfixUnaryExpression(node)) &&
          (node.operator === ts.SyntaxKind.PlusPlusToken || node.operator === ts.SyntaxKind.MinusMinusToken) ? node.operand : null;
      if (target === null || !ts.isIdentifier(target) || target.text !== name) return;
      const found = declarationOf(target, target.text);
      if (found.kind === 'variable' && found.declaration === declaration) writes.push(node as ts.Expression);
    });
    return writes;
  }

  /** A call to a function of this file that only ever returns literals — a closed category. */
  private refuseCall(call: ts.CallExpression): string | null {
    const name = calleeName(call);
    const targets: FunctionNode[] = [];
    walk(this.source, (node) => {
      if (isFunction(node) && functionName(node) === name) targets.push(node);
    });
    const fn = targets[0];
    if (fn === undefined) return `${call.getText(this.source).slice(0, 60)}, a call outside this file`;
    const returns: ts.ReturnStatement[] = [];
    walk(fn.body ?? fn, (node) => {
      if (!ts.isReturnStatement(node)) return;
      for (let scope: ts.Node | undefined = node.parent; scope !== undefined; scope = scope.parent) {
        if (isFunction(scope)) {
          if (scope === fn) returns.push(node);
          return;
        }
      }
    });
    if (returns.length === 0) return `${name}(), which returns nothing`;
    for (const statement of returns) {
      if (statement.expression === undefined) return `${name}(), which may return nothing`;
      const why = this.refuse(statement.expression, false);
      if (why !== null) return `${name}() returns ${why}`;
    }
    return null;
  }
}

/** Every label argument in a runner's source that is not built from code alone, as `<line>: <helper>: <reason>`. */
export function refusedCheckLabels(text: string, fileName = 'runner.mjs'): { labels: number; refused: string[] } {
  const source = ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const helpers = labelHelpers(source);
  const refused: string[] = [];
  let labels = 0;
  walk(source, (node) => {
    if (!ts.isCallExpression(node)) return;
    const helper = calleeName(node);
    for (const index of helpers.get(helper ?? '') ?? []) {
      const argument = node.arguments[index];
      if (argument === undefined) continue;
      labels += 1;
      const why = new LabelReader(source, helpers).refuse(argument, true);
      if (why !== null) refused.push(`${source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1}: ${helper}: ${why}`);
    }
  });
  return { labels, refused };
}
