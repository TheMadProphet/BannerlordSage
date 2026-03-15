// src/tools/get-csharp-type-overview.ts
import { file } from 'bun'
import { join } from 'path'
import { getDb } from '../utils/db'
import { sourcePath } from '../utils/env'
import { extractCodeBlock, generateSignature } from './read-csharp-type'

export async function getCsharpTypeOverview(typeName: string) {
  const db = getDb()
  const rows = db.query<any, any>('SELECT filePath, startLine FROM csharp_index WHERE typeName = $name').all({ $name: typeName })

  if (rows.length === 0) {
    return {
      content: [{ type: 'text' as const, text: `Type '${typeName}' not found in the index. Please check the spelling.` }],
    }
  }

  const parts: string[] = []

  for (const row of rows) {
    const fullPath = join(sourcePath, row.filePath)
    if (!(await file(fullPath).exists())) continue

    const content = await file(fullPath).text()
    const allLines = content.split(/\r?\n/)
    const { code, lineCount } = extractCodeBlock(allLines, row.startLine)

    const header = `// File: ${row.filePath} (lines ${row.startLine + 1}-${row.startLine + lineCount})`
    parts.push(`${header}\n${generateSignature(code)}`)
  }

  return {
    content: [{ type: 'text' as const, text: parts.join('\n\n') }],
  }
}
