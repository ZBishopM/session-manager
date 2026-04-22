/**
 * Tiny, safe expression evaluator for achievement triggers.
 *
 * Grammar:
 *   expr    := or
 *   or      := and ('||' and)*
 *   and     := cmp ('&&' cmp)*
 *   cmp     := primary ( ('>=' | '<=' | '>' | '<' | '==' | '!=') primary )?
 *   primary := NUMBER | IDENT | '(' expr ')'
 *
 * There is no function call, property access, assignment, string literal,
 * or negation. Identifiers resolve against a plain stats object; unknown
 * identifiers default to 0. Malformed input evaluates to false.
 */

export type Stats = Record<string, number>;

interface Token {
  type: string;
  value: string;
}

const TWO_CHAR_OPS = new Set(["&&", "||", ">=", "<=", "==", "!="]);
const ONE_CHAR_OPS = new Set(["(", ")", ">", "<"]);

function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < input.length) {
    const c = input[i]!;
    if (c === " " || c === "\t" || c === "\n" || c === "\r") {
      i++;
      continue;
    }
    if (/\d/.test(c)) {
      let j = i;
      let sawDot = false;
      while (j < input.length) {
        const cj = input[j]!;
        if (cj === ".") {
          if (sawDot) throw new Error("multiple dots in number");
          sawDot = true;
          j++;
        } else if (/\d/.test(cj)) {
          j++;
        } else {
          break;
        }
      }
      tokens.push({ type: "NUM", value: input.slice(i, j) });
      i = j;
      continue;
    }
    if (/[a-zA-Z_]/.test(c)) {
      let j = i;
      while (j < input.length && /\w/.test(input[j]!)) j++;
      tokens.push({ type: "IDENT", value: input.slice(i, j) });
      i = j;
      continue;
    }
    const two = input.slice(i, i + 2);
    if (TWO_CHAR_OPS.has(two)) {
      tokens.push({ type: two, value: two });
      i += 2;
      continue;
    }
    if (ONE_CHAR_OPS.has(c)) {
      tokens.push({ type: c, value: c });
      i++;
      continue;
    }
    throw new Error(`unexpected character: ${c}`);
  }
  return tokens;
}

class Parser {
  private pos = 0;
  constructor(
    private readonly tokens: Token[],
    private readonly stats: Stats,
  ) {}

  private peek(): Token | undefined {
    return this.tokens[this.pos];
  }

  private consume(): Token {
    const t = this.tokens[this.pos++];
    if (!t) throw new Error("unexpected end of expression");
    return t;
  }

  parseExpr(): boolean {
    return this.parseOr();
  }

  private parseOr(): boolean {
    let left = this.parseAnd();
    while (this.peek()?.type === "||") {
      this.consume();
      const right = this.parseAnd();
      left = left || right;
    }
    return left;
  }

  private parseAnd(): boolean {
    let left = this.parseCmp();
    while (this.peek()?.type === "&&") {
      this.consume();
      const right = this.parseCmp();
      left = left && right;
    }
    return left;
  }

  private parseCmp(): boolean {
    const left = this.parsePrimary();
    const op = this.peek();
    if (op && [">=", "<=", ">", "<", "==", "!="].includes(op.type)) {
      this.consume();
      const right = this.parsePrimary();
      switch (op.type) {
        case ">=": return left >= right;
        case "<=": return left <= right;
        case ">": return left > right;
        case "<": return left < right;
        case "==": return left === right;
        case "!=": return left !== right;
      }
    }
    // No comparison: a bare number/identifier is truthy if non-zero.
    return left !== 0;
  }

  private parsePrimary(): number {
    const t = this.consume();
    if (t.type === "NUM") return parseFloat(t.value);
    if (t.type === "IDENT") return this.stats[t.value] ?? 0;
    if (t.type === "(") {
      const val = this.parseExpr();
      const close = this.consume();
      if (close.type !== ")") throw new Error("expected )");
      return val ? 1 : 0;
    }
    throw new Error(`unexpected token: ${t.type}`);
  }

  atEnd(): boolean {
    return this.pos >= this.tokens.length;
  }
}

export function evaluateTrigger(expr: string, stats: Stats): boolean {
  try {
    const tokens = tokenize(expr);
    if (tokens.length === 0) return false;
    const parser = new Parser(tokens, stats);
    const result = parser.parseExpr();
    if (!parser.atEnd()) return false;
    return result;
  } catch {
    return false;
  }
}
