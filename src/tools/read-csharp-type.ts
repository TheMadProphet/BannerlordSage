// src/tools/read-csharp-type.ts
import { file } from 'bun'
import { join } from 'path'
import { getDb } from '../utils/db'
import { sourcePath } from '../utils/env'

const MAX_LINES_THRESHOLD = 400

export async function readCsharpType(typeName: string) {
  const db = getDb()
  const rows = db.query<any, any>('SELECT filePath, startLine FROM csharp_index WHERE typeName = $name').all({ $name: typeName })

  if (rows.length === 0) {
    return {
      content: [{ type: 'text' as const, text: `Type '${typeName}' not found in the index. Please check the spelling.` }],
    }
  }

  const parts: string[] = []
  let isTruncatedMode = false

  for (const row of rows) {
    const fullPath = join(sourcePath, row.filePath)
    if (!(await file(fullPath).exists())) continue

    const content = await file(fullPath).text()
    const allLines = content.split(/\r?\n/)

    // Brace counting to extract the code block
    const { code, lineCount } = extractCodeBlock(allLines, row.startLine)

    let finalCode = code
    let header = `// File: ${row.filePath} (lines ${row.startLine + 1}-${row.startLine + lineCount})`

    if (lineCount > MAX_LINES_THRESHOLD) {
      isTruncatedMode = true
      finalCode = generateSignature(code)
      header += ` [Auto-collapsed: code too long, internal implementation hidden]`
    }

    parts.push(`${header}\n${finalCode}`)
  }

  let output = parts.join('\n\n')
  if (isTruncatedMode) {
    output += `\n\n[System notice] Due to code length, some method implementations have been collapsed.`
  }

  return { content: [{ type: 'text' as const, text: output }] }
}

function extractCodeBlock(lines: string[], startLine: number) {
  let buffer: string[] = []
  let braceCount = 0
  let foundStart = false
  let inBlockComment = false // Track whether we're inside a multi-line comment

  for (let i = startLine; i < lines.length; i++) {
    const line = lines[i]
    buffer.push(line)

    let tempLine = line

    // 1. If still inside a multi-line block comment, look for the end marker
    if (inBlockComment) {
      const endIdx = tempLine.indexOf('*/')
      if (endIdx !== -1) {
        inBlockComment = false
        tempLine = tempLine.substring(endIdx + 2)
      } else {
        tempLine = '' // Entire line is still in a comment, clear it
      }
    }

    // 2. Handle inline /* */ or detect new multi-line comments /*
    while (!inBlockComment && tempLine.includes('/*')) {
      const startIdx = tempLine.indexOf('/*')
      const endIdx = tempLine.indexOf('*/', startIdx + 2)
      if (endIdx !== -1) {
        // Ended on same line, remove the comment portion
        tempLine = tempLine.substring(0, startIdx) + tempLine.substring(endIdx + 2)
      } else {
        // Not ended, starts a multi-line comment
        inBlockComment = true
        tempLine = tempLine.substring(0, startIdx)
      }
    }

    // 3. Strip single-line comments //, double-quoted strings "", and single-quoted chars ''
    const sanitizedLine = tempLine.replace(/\/\/.*|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g, '')

    // 4. Safely count braces
    for (const char of sanitizedLine) {
      if (char === '{') { braceCount += 1; foundStart = true }
      else if (char === '}') { braceCount -= 1 }
    }

    if (foundStart && braceCount === 0) break
  }

  return { code: buffer.join('\n'), lineCount: buffer.length }
}

// Auto-summary algorithm for overly long code
function generateSignature(code: string): string {
  const lines = code.split('\n')
  const output: string[] = []
  let depth = 0

  for (const line of lines) {
    let depthChange = 0
    for (const char of line) {
      if (char === '{') depthChange++
      if (char === '}') depthChange--
    }

    if (depth <= 1) {
      if (depth === 1 && depthChange > 0) {
        output.push(line)
        if (!line.includes('}')) output.push('    // ... implementation hidden ...')
      } else {
        output.push(line)
      }
    } else if (depth + depthChange <= 1) {
      const indent = line.match(/^\s*/)?.[0] || ''
      output.push(`${indent}}`)
    }
    depth += depthChange
  }
  return output.join('\n')
}
