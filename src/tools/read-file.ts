// src/tools/read-file.ts
import { file } from 'bun'
import { PathSandbox } from '../utils/path-sandbox'

export async function readFile(sandbox: PathSandbox, relativePath: string, startLine: number = 0, lineCount: number = 400) {
  try {
    const fullPath = sandbox.validateAndResolve(relativePath)
    const content = await file(fullPath).text()
    const allLines = content.split(/\r?\n/)

    const endLine = Math.min(startLine + lineCount, allLines.length)
    const output = allLines.slice(startLine, endLine).join('\n')

    return {
      content: [{ type: 'text' as const, text: output + (endLine < allLines.length ? `\n\n[Note] File not fully read. Continue reading from line ${endLine}.` : '') }]
    }
  } catch (error) {
    throw new Error(`Unable to read file: ${relativePath}`)
  }
}