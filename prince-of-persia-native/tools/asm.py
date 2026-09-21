"""A tiny assembler for the data-only Merlin sources (SEQTABLE.S, FRAMEDEF.S): org, labels
(global and :local), db/dfb/dw/ds/hex, expressions with +/- and $hex, and the equates a file sets."""
import re

def parse_expr(expr, symbols, local_scope, strict=True):
    expr = expr.strip()
    total = 0; sign = 1; i = 0
    tokens = re.findall(r'[+-]|\$[0-9A-Fa-f]+|\d+|[:\]A-Za-z_][A-Za-z0-9_:\]]*|"."', expr)
    for tok in tokens:
        if tok == '+': sign = 1; continue
        if tok == '-': sign = -sign; continue
        if tok.startswith('$'): v = int(tok[1:], 16)
        elif tok.isdigit(): v = int(tok)
        elif tok.startswith('"'): v = ord(tok[1])
        elif tok.startswith(':'): v = symbols.get(local_scope + tok, 0) if not strict else symbols[local_scope + tok]
        else: v = symbols.get(tok, 0) if not strict else symbols[tok]
        total += sign * v; sign = 1
    return total

def assemble(text, symbols=None, org=0):
    symbols = dict(symbols or {})
    lines = [l.split(';')[0].rstrip() for l in text.split('\n')]
    # two passes: sizes first
    def run(emit):
        strict = emit
        pc = org; scope = ''; indum = False; pc_save = 0; cond = []
        out = bytearray()
        for raw in lines:
            if not raw.strip() or raw.lstrip().startswith('*'): continue
            m = re.match(r'^(\S+)?\s*(\S+)?\s*(.*)$', raw)
            label, op, arg = m.group(1), m.group(2), m.group(3)
            lop = (op or '').lower()
            if lop == 'do': cond.append(bool(parse_expr(arg, symbols, scope, strict))); continue
            if lop == 'else': cond[-1] = not cond[-1]; continue
            if lop == 'fin': cond.pop(); continue
            if cond and not all(cond): continue
            if label:
                if label.startswith(':'): symbols[scope + label] = pc
                else: scope = label; symbols[label] = pc
            if not op: continue
            op = op.lower()
            if op == 'org': pc = parse_expr(arg, symbols, scope, strict); org_here = pc; continue
            if op == 'dend': indum = False; pc = pc_save; continue
            if op in ('lst', 'tr', 'lstdo', 'usr', 'put', 'fin', 'do', 'else'): continue
            if op == '=':
                symbols[label] = parse_expr(arg, symbols, scope, strict); continue
            if op == 'dum': pc_save = pc; indum = True; pc = parse_expr(arg, symbols, scope, strict); continue
            if op == 'ds':
                if arg.startswith('\\'): n = 0
                else:
                    a = arg.split(',')[0]
                    if '-*' in a: n = parse_expr(a.replace('-*', ''), symbols, scope, strict) - pc
                    else: n = parse_expr(a, symbols, scope, strict)
                if emit and not indum: out.extend(b'\0' * n)
                pc += n; continue
            if op in ('db', 'dfb'):
                for part in split_args(arg):
                    v = parse_expr(part, symbols, scope, strict) & 0xFF
                    if emit: out.append(v)
                    pc += 1
                continue
            if op == 'dw' or op == 'da':
                for part in split_args(arg):
                    v = parse_expr(part, symbols, scope, strict) & 0xFFFF
                    if emit: out.extend([v & 0xFF, v >> 8])
                    pc += 2
                continue
            if op == 'hex':
                h = arg.replace(',', '').replace(' ', '')
                bs = bytes.fromhex(h)
                if emit: out.extend(bs)
                pc += len(bs); continue
            raise ValueError('unknown op %r in line %r' % (op, raw))
        return out
    run(False)
    return bytes(run(True)), symbols

def split_args(arg):
    parts = []; depth = 0; cur = ''
    for ch in arg:
        if ch == ',' and depth == 0: parts.append(cur); cur = ''
        else: cur += ch
    if cur.strip(): parts.append(cur)
    return [p for p in parts if p.strip()]
