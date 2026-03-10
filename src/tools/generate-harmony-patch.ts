// src/tools/generate-harmony-patch.ts
import { getDb } from '../utils/db'
import { file } from 'bun'
import { join } from 'path'
import { sourcePath } from '../utils/env'

type FoundSig = {
  sig: string
  isStatic: boolean
  params: string
  typeHint: string
}

export async function generateHarmonyPatch(className: string, methodName: string) {
  const db = getDb()
  const row = db
    .query<any, any>('SELECT filePath FROM csharp_index WHERE typeName = $name LIMIT 1')
    .get({ $name: className })

  if (!row) return { content: [{ type: 'text' as const, text: `Class not found: ${className}` }] }

  const fullPath = join(sourcePath, row.filePath)
  const content = await file(fullPath).text()
  const lines = content.split(/\r?\n/)

  const escapedMethod = escapeRegExp(methodName)

  /**
   * Match lines that look like method declarations:
   * - Allow 0+ modifiers
   * - Allow return types with: namespaces/generics/arrays/nullable/pointers/global::
   * - Allow explicit interface implementation prefix: IFoo.
   * - Constructor support not specifically included; when methodName=className it can partially match
   */
  const declRe = new RegExp(
    '^\\s*' +
      // 0+ modifiers (any order)
      '(?:(?:public|private|protected|internal|static|virtual|override|abstract|sealed|async|unsafe|extern|new|partial)\\s+)*' +
      // Return type (relaxed): allows global::System.Collections.Generic.List<int?>[]* etc.
      '(?:[\\w\\s<>,\\.\\?\\*:\\[\\]]+\\s+)?' +
      // Explicit interface implementation prefix (can be multiple levels)
      '(?:\\w+\\.)*' +
      // Method name + opening parenthesis
      `\\b${escapedMethod}\\s*\\(`
  )

  let signatures: FoundSig[] = []
  let inBlockComment = false

  for (let i = 0; i < lines.length; i++) {
    let rawLine = lines[i]

    // 1) Handle block comments (state machine) + strip inline /*...*/
    const commentProcessed = stripBlockComments(rawLine, () => inBlockComment, (v) => (inBlockComment = v))
    if (commentProcessed == null) continue // Entire line is inside a block comment
    rawLine = commentProcessed

    const trimmed = rawLine.trim()
    if (!trimmed) continue
    if (trimmed.startsWith('//')) continue

    // 2) Filter obvious non-declarations: skip lines without '('
    if (!trimmed.includes('(')) continue

    // 3) Only match declarations
    if (!declRe.test(rawLine)) continue

    // 4) Exclude obvious assignments/delegates/lambdas: = appearing before method name (not ==)
    const eqIdx = indexOfSingleEqualsBefore(trimmed, methodName)
    if (eqIdx !== -1) continue

    // 5) Join multi-line signatures: until line ends with { or ;, or contains =>
    //    Note: not splitting on '//' to avoid breaking URLs in strings.
    let fullSig = trimmed
    let j = i
    while (j < lines.length - 1 && !/[{;]\s*$/.test(fullSig) && !/=>/.test(fullSig)) {
      j++
      let nextLine = lines[j]
      const nextProcessed = stripBlockComments(nextLine, () => inBlockComment, (v) => (inBlockComment = v))
      if (nextProcessed == null) continue
      nextLine = nextProcessed.trim()
      if (!nextLine) continue
      if (nextLine.startsWith('//')) continue
      fullSig += ' ' + nextLine
    }

    // 6) Extract parameters (parenthesis counting)
    const params = extractParenContent(fullSig, '(' , ')')

    // 7) If parentheses are incomplete, it's a false positive — skip
    if (params == null) continue

    const isStatic = /\bstatic\b/.test(fullSig)

    // 8) Generate Type[] hint (best-effort: handles complex tuples/multi-dim arrays/nested generics)
    const typeHint = extractTypesForHint(params)

    // 9) Deduplicate
    if (!signatures.find((s) => s.sig === fullSig)) {
      signatures.push({ sig: fullSig, isStatic, params, typeHint })
    }

    // Skip to j to avoid re-scanning the same signature's continuation lines
    i = Math.max(i, j)
  }

  // Instance parameter hint (ensures the template compiles directly)
  let instanceParamHint = ''
  if (signatures.length === 1) {
    instanceParamHint = signatures[0].isStatic ? '' : `${className} __instance, `
  } else if (signatures.length > 1) {
    instanceParamHint = `/* For instance methods, add: ${className} __instance, */ `
  } else {
    instanceParamHint = `/* For instance methods, add: ${className} __instance, */ `
  }

  const sigText =
    signatures.length > 0
      ? signatures
          .map((s, idx) => {
            const hintLine = s.typeHint ? `// Overload hint: new Type[] { ${s.typeHint} }` : ''
            return `// [${idx + 1}] ${s.sig}\n// Parameters: (${s.params})\n${hintLine}`.trimEnd()
          })
          .join('\n// \n')
      : '// Warning: Could not extract precise signature. May be an unusual pattern (local function/generated code/macro-style line breaks/unusual formatting). Please check the original C# file manually.'

  const patchTemplate = `
// Auto-generated Harmony patch template
// Target class: ${className}
// File path: ${row.filePath}

// Found method signature(s):
${sigText}

using HarmonyLib;
using System;

namespace YourModNamespace.Patches
{
    // If multiple overloads with the same name exist, uncomment the line below and fill in parameter types (see "Overload hint" above):
    // [HarmonyPatch(typeof(${className}), "${methodName}", new Type[] { /* typeof(int), typeof(float) ... */ })]
    [HarmonyPatch(typeof(${className}), "${methodName}")]
    public class ${className}_${methodName}_Patch
    {
        // Prefix: runs before the original method
        // Default void to ensure template compiles directly.
        // To skip the original method: change to static bool Prefix(...) and return false;
        static void Prefix(${instanceParamHint}/* Fill in original method parameters here */ /*, ref ReturnType __result */)
        {
            // TODO: Pre-execution logic
        }

        // Postfix: runs after the original method
        static void Postfix(${instanceParamHint}/* Fill in original method parameters here */ /*, ref ReturnType __result */)
        {
            // TODO: Post-execution logic
        }
    }
}
`

  return { content: [{ type: 'text' as const, text: patchTemplate }] }
}

// =====================================================
// helpers
// =====================================================

function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Strip block comments: supports
 * - Inline /* ... *\/
 * - Multi-line block comment state machine
 * Returns:
 * - null: entire line is inside a block comment, should skip
 * - string: line with block comments removed (may be empty)
 */
function stripBlockComments(
  line: string,
  getState: () => boolean,
  setState: (v: boolean) => void
): string | null {
  let raw = line

  // If currently inside a block comment, find the end first
  if (getState()) {
    const endIdx = raw.indexOf('*/')
    if (endIdx === -1) return null
    setState(false)
    raw = raw.slice(endIdx + 2)
  }

  // Repeatedly strip inline block comments
  while (true) {
    const startIdx = raw.indexOf('/*')
    if (startIdx === -1) break

    const endIdx = raw.indexOf('*/', startIdx + 2)
    if (endIdx !== -1) {
      raw = raw.slice(0, startIdx) + raw.slice(endIdx + 2)
      continue
    } else {
      // Starts a multi-line block comment
      setState(true)
      raw = raw.slice(0, startIdx)
      break
    }
  }

  return raw
}

/**
 * Find a single '=' appearing before the method name, used to exclude assignments/lambdas/delegates.
 * Rule: '=' exists and is not '==', '=>', '>=', '<=', '!=', and '=' position is before methodName
 */
function indexOfSingleEqualsBefore(line: string, methodName: string): number {
  const mIdx = line.indexOf(methodName)
  if (mIdx === -1) return -1

  for (let i = 0; i < Math.min(mIdx, line.length); i++) {
    if (line[i] !== '=') continue
    const prev = line[i - 1] ?? ''
    const next = line[i + 1] ?? ''
    // Exclude == => >= <= !=
    if (next === '=' || next === '>' || prev === '>' || prev === '<' || prev === '!') continue
    return i
  }
  return -1
}

/**
 * Extract matched parenthesis content (supports nesting), e.g., from "Foo(a, Bar(b))" extract "a, Bar(b)"
 * Returns null if parentheses are incomplete
 */
function extractParenContent(text: string, open: '(' | '<' | '[', close: ')' | '>' | ']'): string | null {
  const start = text.indexOf(open)
  if (start === -1) return ''

  let depth = 0
  for (let i = start; i < text.length; i++) {
    const c = text[i]
    if (c === open) depth++
    else if (c === close) {
      depth--
      if (depth === 0) {
        return text.slice(start + 1, i).trim()
      }
    }
  }
  return null
}

/**
 * Convert parameter string to typeof() array hint:
 * - Split parameters ignoring commas inside < > ( ) [ ] depth
 * - Extract "type" from each parameter:
 *   1) Remove default values "= ..."
 *   2) Remove prefix keywords ref/out/in/params/this/scoped/readonly (best-effort)
 *   3) Strip parameter name (last identifier) from the right, remainder is the type string
 */
function extractTypesForHint(paramsStr: string): string {
  if (!paramsStr) return ''

  const args = splitParamsTopLevel(paramsStr)
  const typeExprs: string[] = []

  for (const arg of args) {
    const t = extractTypeFromParam(arg)
    if (!t) continue
    typeExprs.push(`typeof(${t})`)
  }

  return typeExprs.join(', ')
}

function splitParamsTopLevel(paramsStr: string): string[] {
  const out: string[] = []
  let current = ''

  let angle = 0 // < >
  let paren = 0 // ( )
  let bracket = 0 // [ ]

  for (let i = 0; i < paramsStr.length; i++) {
    const c = paramsStr[i]

    if (c === '<') angle++
    else if (c === '>') angle = Math.max(0, angle - 1)
    else if (c === '(') paren++
    else if (c === ')') paren = Math.max(0, paren - 1)
    else if (c === '[') bracket++
    else if (c === ']') bracket = Math.max(0, bracket - 1)

    if (c === ',' && angle === 0 && paren === 0 && bracket === 0) {
      if (current.trim()) out.push(current.trim())
      current = ''
      continue
    }

    current += c
  }

  if (current.trim()) out.push(current.trim())
  return out
}

function extractTypeFromParam(param: string): string {
  if (!param) return ''

  // Remove default value
  let s = param
  const eq = findTopLevelEquals(s)
  if (eq !== -1) s = s.slice(0, eq).trim()

  // Remove attributes (parameters can have [Attr], roughly strip leading [...] blocks)
  while (s.trim().startsWith('[')) {
    const inside = extractBracketBlock(s.trim(), '[', ']')
    if (!inside) break
    // Remove first [...] block
    const firstClose = s.trim().indexOf(']') // Rough; nested brackets are rare
    if (firstClose === -1) break
    s = s.trim().slice(firstClose + 1).trim()
  }

  // Remove possible prefix keywords (multiple tokens)
  s = removeLeadingKeywords(s, ['ref', 'out', 'in', 'params', 'this', 'scoped', 'readonly'])

  // Strip trailing parameter name: last identifier (starts with a-zA-Z_, followed by digits/underscores)
  // Note: type may end with "]" ">" ")" "?" "*", but parameter name is always an identifier
  const lastIdent = findLastIdentifier(s)
  if (!lastIdent) return s.trim()

  const { start, end } = lastIdent
  // If preceded by a dot, it may be part of namespace/nested type, not a parameter name
  // Parameter names are typically preceded by whitespace, *, ?, ], >, or ), not '.'
  const before = s[start - 1] ?? ''
  if (before === '.') {
    // May be part of the type (e.g., global::System.String), don't strip
    return s.trim()
  }

  // Check if it's a parameter name: identifier should be at end of string (default values already stripped)
  const tail = s.slice(end).trim()
  if (tail.length !== 0) {
    // Something after it, unlikely to be parameter name (e.g., "T where ..." isn't a param list)
    return s.trim()
  }

  const typePart = s.slice(0, start).trim()
  return typePart || s.trim()
}

function removeLeadingKeywords(s: string, keywords: string[]): string {
  let t = s.trim()
  while (true) {
    const m = t.match(/^(\w+)\b/)
    if (!m) break
    const kw = m[1]
    if (!keywords.includes(kw)) break
    t = t.slice(kw.length).trim()
  }
  return t
}

function findLastIdentifier(s: string): { start: number; end: number } | null {
  // Search from right to left for the last identifier
  for (let i = s.length - 1; i >= 0; i--) {
    const c = s[i]
    if (!isIdentChar(c)) continue

    // Found end of identifier
    let end = i + 1
    let start = i
    while (start - 1 >= 0 && isIdentChar(s[start - 1])) start--

    // First character must be a letter or _
    const first = s[start]
    if (!isIdentStart(first)) {
      i = start - 1
      continue
    }
    return { start, end }
  }
  return null
}

function isIdentStart(c: string) {
  return (c >= 'A' && c <= 'Z') || (c >= 'a' && c <= 'z') || c === '_'
}

function isIdentChar(c: string) {
  return isIdentStart(c) || (c >= '0' && c <= '9')
}

function findTopLevelEquals(s: string): number {
  // Find "top-level =", ignoring content inside < > ( ) [ ]
  let angle = 0, paren = 0, bracket = 0
  for (let i = 0; i < s.length; i++) {
    const c = s[i]
    if (c === '<') angle++
    else if (c === '>') angle = Math.max(0, angle - 1)
    else if (c === '(') paren++
    else if (c === ')') paren = Math.max(0, paren - 1)
    else if (c === '[') bracket++
    else if (c === ']') bracket = Math.max(0, bracket - 1)
    else if (c === '=' && angle === 0 && paren === 0 && bracket === 0) {
      const prev = s[i - 1] ?? ''
      const next = s[i + 1] ?? ''
      if (next === '=' || next === '>' || prev === '>' || prev === '<' || prev === '!') continue
      return i
    }
  }
  return -1
}

function extractBracketBlock(s: string, open: '[' , close: ']' ): string | null {
  return extractParenContent(s, open, close)
}