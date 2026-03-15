// src/server.ts
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { PathSandbox } from './utils/path-sandbox'

// Import all tool functions at the top
import { readCsharpType } from './tools/read-csharp-type'
import { searchSource } from './tools/search-source'
import { readFile } from './tools/read-file'
import { listDirectory } from './tools/list-directory'
import { searchXml } from './tools/search-xml'
import { traceTroopTree } from './tools/trace-troop-tree'
import { getItemStats } from './tools/get-item-stats'
import { generateHarmonyPatch } from './tools/generate-harmony-patch'
import { readGauntletUi } from './tools/read-gauntlet-ui'
import { getCsharpTypeOverview } from './tools/get-csharp-type-overview'

// Initialize security sandbox pointing to the source root directory
const sandbox = new PathSandbox('dist/assets')

export const server = new McpServer({
  name: 'bannerlord-sage',
  version: '0.9.0',
})

// --- 1. C# Type Lookup Tool ---
server.registerTool(
  'read_csharp_type',
  {
    description: 'Look up the full definition and source code of a Bannerlord C# class.',
    inputSchema: {
      typeName: z.string().describe('Exact type name (e.g., "MobileParty", "Hero").'),
    },
  },
  async ({ typeName }) => await readCsharpType(typeName),
)

// --- 2. C# Type Overview Tool ---
server.registerTool(
  'get_csharp_type_overview',
  {
    description: 'Get a compact overview of a Bannerlord C# type showing only method/property signatures with implementations collapsed.',
    inputSchema: {
      typeName: z.string().describe('Exact type name (e.g., "MobileParty", "Hero").'),
    },
  },
  async ({ typeName }) => await getCsharpTypeOverview(typeName),
)

// --- 3. Full-Text Source Search Tool ---
server.registerTool(
  'search_source',
  {
    description: 'Perform a regex full-text search across Bannerlord source code.',
    inputSchema: {
      query: z.string().describe('Search keyword or regex pattern'),
      filePattern: z.string().optional().describe('File name filter, e.g., "*.cs"'),
    },
  },
  async ({ query, filePattern }) => await searchSource(sandbox, query, false, filePattern),
)

// --- 3. Read File Tool ---
server.registerTool(
  'read_file',
  {
    description: 'Read the contents of a specific source or XML file.',
    inputSchema: {
      path: z.string().describe('Path relative to dist/assets'),
      startLine: z.number().optional().default(0).describe('Starting line number'),
    },
  },
  async ({ path, startLine }) => await readFile(sandbox, path, startLine),
)

// --- 4. List Directory Tool ---
server.registerTool(
  'list_directory',
  {
    description: 'View the directory structure under source or XML folders.',
    inputSchema: {
      path: z.string().optional().default('').describe('Relative folder path'),
    },
  },
  async ({ path }) => await listDirectory(sandbox, path),
)

// --- 5. XML Data Search Tool ---
server.registerTool(
  'search_xml',
  {
    description: 'Search Bannerlord XML data files (troops, items, settings) by keyword.',
    inputSchema: {
      query: z.string().describe('Search keyword')
    },
  },
  async ({ query }) => await searchXml(query),
)

// --- 6. Troop Tree Tracer ---
server.registerTool(
  'trace_troop_tree',
  {
    description: 'Trace Bannerlord troop upgrade paths and base attributes.',
    inputSchema: { characterId: z.string().describe('Troop ID, e.g., vlandian_recruit') },
  },
  async ({ characterId }) => await traceTroopTree(characterId),
)

// --- 7. Item Stats Extractor ---
server.registerTool(
  'get_item_stats',
  {
    description: 'Quickly extract core stats for Bannerlord equipment/weapons.',
    inputSchema: { itemId: z.string().describe('Item ID, e.g., western_sword_t3') },
  },
  async ({ itemId }) => await getItemStats(itemId),
)

// --- 8. Harmony Patch Generator ---
server.registerTool(
  'generate_harmony_patch',
  {
    description: 'Auto-generate a Harmony Prefix/Postfix patch code template for a Bannerlord C# method.',
    inputSchema: {
      className: z.string().describe('Target class name (e.g., MobileParty)'),
      methodName: z.string().describe('Target method name (e.g., CalculateSpeed)'),
    },
  },
  async ({ className, methodName }) => await generateHarmonyPatch(className, methodName),
)

// --- 9. UI Parser ---
server.registerTool(
  'read_gauntlet_ui',
  {
    description: 'Parse Bannerlord Gauntlet UI XML to extract ViewModel DataSource bindings and Click events.',
    inputSchema: { uiFileName: z.string().describe('UI file name (e.g., InventoryScreen)') },
  },
  async ({ uiFileName }) => await readGauntletUi(sandbox, uiFileName),
)