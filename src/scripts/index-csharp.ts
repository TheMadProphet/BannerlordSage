// src/scripts/index-csharp.ts
import { Database } from 'bun:sqlite'
import { file, Glob } from 'bun'
import { join } from 'path'
import { dbPath, sourcePath } from '../utils/env'
import { Parser, Language, Query } from 'web-tree-sitter'

// This regex precisely captures C# classes, structs, interfaces, and enums
const typeRegex =
  /^\s*(?:public|private|protected|internal|abstract|sealed|static|partial|readonly|unsafe|\s)*\s+(class|struct|interface|enum)\s+([a-zA-Z0-9_]+)/

const TYPE_CONTAINER_KINDS = new Set([
  'class_declaration',
  'struct_declaration',
  'interface_declaration',
])

function getEnclosingTypeName(node: Parser.SyntaxNode): string | null {
  let current = node.parent
  while (current) {
    if (TYPE_CONTAINER_KINDS.has(current.type)) {
      const nameNode = current.childForFieldName('name')
      return nameNode?.text ?? null
    }
    current = current.parent
  }
  return null
}

async function main() {
  console.log(`Scanning Bannerlord C# source code at: ${sourcePath}`)

  const db = new Database(dbPath)

  try {
    // Create the csharp_index table to serve as our type registry
    db.run(`
      CREATE TABLE IF NOT EXISTS csharp_index (
        typeName TEXT,
        filePath TEXT,
        startLine INTEGER,
        typeKind TEXT,
        PRIMARY KEY (typeName, filePath)
      );
    `)

    db.run(`
      CREATE TABLE IF NOT EXISTS methods_index (
        typeName   TEXT,
        methodName TEXT,
        filePath   TEXT,
        startLine  INTEGER,
        endLine    INTEGER,
        kind       TEXT,
        PRIMARY KEY (typeName, methodName, startLine, filePath)
      );
    `)

    const insertType = db.prepare(`
      INSERT OR REPLACE INTO csharp_index (typeName, filePath, startLine, typeKind)
      VALUES ($typeName, $filePath, $startLine, $typeKind)
    `)

    const insertMethod = db.prepare(`
      INSERT OR REPLACE INTO methods_index (typeName, methodName, filePath, startLine, endLine, kind)
      VALUES ($typeName, $methodName, $filePath, $startLine, $endLine, $kind)
    `)

    // Initialize tree-sitter parser
    await Parser.init()
    const parser = new Parser()
    const wasmPath = require.resolve('tree-sitter-c-sharp/tree-sitter-c_sharp.wasm')
    const CSharp = await Language.load(wasmPath)
    parser.setLanguage(CSharp)

    const methodQuery = new Query(CSharp, `
      [
        (method_declaration      name: (identifier) @name) @node
        (constructor_declaration name: (identifier) @name) @node
        (property_declaration    name: (identifier) @name) @node
      ]
    `)

    const glob = new Glob('**/*.cs')

    let fileCount = 0
    let typeCount = 0
    let methodCount = 0
    const typeBatch: any[] = []
    const methodBatch: any[] = []

    // Iterate over all .cs files in the Source directory
    for await (const relativePath of glob.scan({
      cwd: sourcePath,
      onlyFiles: true,
    })) {
      fileCount += 1
      const absolutePath = join(sourcePath, relativePath)

      try {
        const content = await file(absolutePath).text()
        const lines = content.split(/\r?\n/)
        const normalizedPath = relativePath.replaceAll('\\', '/')

        // Pass 1: regex scan for types
        lines.forEach((line, index) => {
          if (line.length < 10) return

          const match = line.match(typeRegex)
          if (match) {
            const typeKind = match[1]
            const typeName = match[2]

            typeBatch.push({
              $typeName: typeName,
              $filePath: normalizedPath,
              $startLine: index, // 0-indexed line number
              $typeKind: typeKind,
            })
            typeCount++
          }
        })

        // Pass 2: tree-sitter scan for methods
        const tree = parser.parse(content)
        const captures = methodQuery.captures(tree.rootNode as any)

        // captures alternate: @node, @name pairs — we only care about @node
        for (const capture of captures) {
          if (capture.name !== 'node') continue

          const node = capture.node
          const nameNode = node.childForFieldName('name')
          if (!nameNode) continue

          const methodName = nameNode.text
          const typeName = getEnclosingTypeName(node)
          if (!typeName) continue

          let kind: string
          switch (node.type) {
            case 'method_declaration':
              kind = 'method'
              break
            case 'constructor_declaration':
              kind = 'constructor'
              break
            case 'property_declaration':
              kind = 'property'
              break
            default:
              continue
          }

          methodBatch.push({
            $typeName: typeName,
            $methodName: methodName,
            $filePath: normalizedPath,
            $startLine: node.startPosition.row,
            $endLine: node.endPosition.row,
            $kind: kind,
          })
          methodCount++
        }
      } catch (error) {
        console.warn(`Failed to read file ${relativePath}:`, error)
      }
    }

    console.log(`Scanned ${fileCount} files. Writing ${typeCount} types and ${methodCount} methods to local database...`)

    // Use transactions for batch writes (very fast)
    const typeTransaction = db.transaction((entries: any[]) => {
      for (const entry of entries) {
        insertType.run(entry)
      }
    })

    const methodTransaction = db.transaction((entries: any[]) => {
      for (const entry of entries) {
        insertMethod.run(entry)
      }
    })

    typeTransaction(typeBatch)
    methodTransaction(methodBatch)
    console.log(`Indexing complete.`)
  } finally {
    db.close()
  }
}

try {
  main()
} catch (error) {
  console.log('Fatal error:', error)
  process.exit(1)
}
