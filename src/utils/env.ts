// src/utils/env.ts
import { join } from 'path'

export const root = join(import.meta.dir, '../../')
const distPath = join(root, 'dist')

export const versionPath = join(distPath, 'Version.txt')
export const defsPath = join(distPath, 'assets/Xmls') // Where Bannerlord XML files are stored
export const sourcePath = join(distPath, 'assets/Source')
export const dbPath = join(distPath, 'bannerlord.db') // Single unified database