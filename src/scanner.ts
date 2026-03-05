import { readFileSync } from 'fs'
import { resolve } from 'path'
import { glob } from 'glob'
import type { ScanResult, RuleResult } from './types'
import { ALL_RULES } from './rules'

const IGNORE_PATHS = [
  '**/vendor/**',
  '**/node_modules/**',
  '**/storage/**',
  '**/bootstrap/cache/**',
  '**/.git/**',
  '**/public/**',
]

// Only scan these app directories — ignore everything else
const APP_DIRS = ['app', 'src', 'routes', 'config', 'database']

export async function scan(dir: string): Promise<ScanResult> {
  const start = Date.now()

  // Scan only app-level dirs, never vendor
  const absDir = resolve(dir)
  const patterns = APP_DIRS.map(d => `${absDir}/${d}/**/*.php`)
  const allFiles = await Promise.all(patterns.map(p => glob(p, { ignore: IGNORE_PATHS })))
  const files = allFiles.flat()

  // Initialize results once
  const ruleResults: RuleResult[] = ALL_RULES.map(rule => ({
    ...rule('', ''),
    matches: [],
  }))

  let scanned = 0

  for (const file of files) {
    try {
      const content = readFileSync(file, 'utf-8')
      scanned++
      for (let i = 0; i < ALL_RULES.length; i++) {
        const result = ALL_RULES[i](content, file)
        // Normalize to relative paths
        result.matches = result.matches.map(m => ({
          ...m,
          file: m.file.replace(absDir + '/', ''),
        }))
        ruleResults[i].matches.push(...result.matches)
      }
    } catch {
      // skip unreadable files
    }
  }

  const activeRules = ruleResults.filter(r => r.matches.length > 0)
  const errors = activeRules.filter(r => r.severity === 'error').reduce((s, r) => s + r.matches.length, 0)
  const warnings = activeRules.filter(r => r.severity === 'warning').reduce((s, r) => s + r.matches.length, 0)
  const score = Math.max(0, Math.round(100 - errors * 4 - warnings * 1.5))

  return {
    totalFiles: files.length,
    scannedFiles: scanned,
    duration: Date.now() - start,
    rules: activeRules,
    score,
  }
}