// src/tools/get-csharp-method.ts
import { file } from 'bun'
import { join } from 'path'
import { getDb } from '../utils/db'
import { sourcePath } from '../utils/env'

export async function getCsharpMethod(typeName: string, methodName: string) {
  const db = getDb()
  const rows = db
    .query<any, any>(
      `SELECT filePath, startLine, endLine, kind
       FROM methods_index
       WHERE typeName = $typeName AND methodName = $methodName
       ORDER BY startLine`,
    )
    .all({ $typeName: typeName, $methodName: methodName })

  if (rows.length === 0) {
    return {
      content: [
        {
          type: 'text' as const,
          text: `Method '${methodName}' not found on type '${typeName}'. Check spelling or use get_csharp_type_overview to list available members.`,
        },
      ],
    }
  }

  const parts: string[] = []

  for (const row of rows) {
    const fullPath = join(sourcePath, row.filePath)
    if (!(await file(fullPath).exists())) continue

    const content = await file(fullPath).text()
    const lines = content.split(/\r?\n/)

    const startLine: number = row.startLine
    const endLine: number = row.endLine

    const slice = lines.slice(startLine, endLine + 1).join('\n')
    const header = `// File: ${row.filePath} (lines ${startLine + 1}-${endLine + 1}) [${row.kind}]`

    parts.push(`${header}\n${slice}`)
  }

  if (parts.length === 0) {
    return {
      content: [{ type: 'text' as const, text: `Source file(s) for '${typeName}.${methodName}' could not be read.` }],
    }
  }

  return { content: [{ type: 'text' as const, text: parts.join('\n\n') }] }
}
