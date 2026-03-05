export type Severity = 'error' | 'warning'

export interface RuleMatch {
  file: string
  line: number
  message?: string
}

export interface RuleResult {
  id: string
  title: string
  description: string
  severity: Severity
  category: 'database' | 'concurrency' | 'architecture' | 'performance'
  docs?: string
  matches: RuleMatch[]
}

export interface ScanResult {
  totalFiles: number
  scannedFiles: number
  duration: number
  rules: RuleResult[]
  score: number
}
