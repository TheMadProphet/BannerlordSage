// src/utils/xml-utils.ts
import { XMLParser, XMLBuilder } from 'fast-xml-parser'

// Critical config: ignoreAttributes: false ensures we can read id="xxx" and other attributes in Bannerlord XML
export const parser = new XMLParser({
  ignoreAttributes: false, 
  processEntities: false,
})

export const builder = new XMLBuilder({
  ignoreAttributes: false,
  format: true,
})