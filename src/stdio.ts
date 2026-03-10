// src/stdio.ts
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { closeDb } from './utils/db'
import { server } from './server'

async function main() {
  const transport = new StdioServerTransport()
  await server.connect(transport)

  console.error('BannerlordSage MCP started successfully! Waiting for AI connection...')

  const cleanup = () => {
    console.error('Shutting down server...')
    closeDb()
    process.exit(0)
  }

  process.on('SIGINT', cleanup)
  process.on('SIGTERM', cleanup)
}

try {
  main()
} catch (error) {
  console.error('Fatal error:', error)
  process.exit(1)
}