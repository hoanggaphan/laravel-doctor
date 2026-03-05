import type { RuleResult, RuleMatch } from '../types'

type RuleFn = (content: string, file: string) => RuleResult

// ─── helpers ─────────────────────────────────────────────────────────────────

function lines(content: string): string[] {
  return content.split('\n')
}

function matchLines(content: string, file: string, pattern: RegExp): RuleMatch[] {
  return lines(content).reduce<RuleMatch[]>((acc, line, i) => {
    if (pattern.test(line)) acc.push({ file, line: i + 1 })
    return acc
  }, [])
}

function isTestFile(file: string): boolean {
  return /\/(tests?|spec|__tests__|database\/seeders|database\/factories)\//i.test(file)
}

function isMigrationFile(file: string): boolean {
  return /\/database\/migrations\//.test(file)
}

function isServiceOrRepo(file: string): boolean {
  return /(Service|Repository|Repo|Action|Job|Command|Event|Listener|Handler)\.(php)$/.test(file)
}

// ─── Rule 1: dd() / dump() / var_dump() ──────────────────────────────────────

export const debugStatements: RuleFn = (content, file) => ({
  id: 'debug-statements',
  title: 'Debug statement left in code',
  description: 'Remove dd(), dump(), var_dump(), ray() before committing',
  severity: 'error',
  category: 'architecture',
  matches: isTestFile(file)
    ? []
    : matchLines(content, file, /^\s*(?:dd|dump|var_dump|ray)\s*\(/m),
})

// ─── Rule 2: Fat Controller ───────────────────────────────────────────────────

export const fatController: RuleFn = (content, file) => {
  if (!file.match(/Controllers?\/.*Controller\.php$/)) {
    return { id: 'fat-controller', title: 'Business logic in Controller — move to Service layer', description: '', severity: 'warning', category: 'architecture', matches: [] }
  }

  const matches: RuleMatch[] = []
  const badPatterns = [/\bDB::(select|insert|update|delete|statement|unprepared)\s*\(/]

  lines(content).forEach((line, i) => {
    if (/^\s*\/\//.test(line) || /^\s*\*/.test(line)) return
    if (/\b[A-Z][a-zA-Z]+::(find|where|query|all|create|first)\s*\(/.test(line)) return
    if (badPatterns.some(p => p.test(line))) matches.push({ file, line: i + 1 })
  })

  const methodLengths = extractMethodLengths(content)
  for (const { name, length, startLine } of methodLengths) {
    if (length > 50 && !['__construct', 'boot', 'register'].includes(name)) {
      matches.push({ file, line: startLine, message: `Method "${name}" is ${length} lines — extract to Service` })
    }
  }

  return {
    id: 'fat-controller',
    title: 'Business logic in Controller — move to Service layer',
    description: 'Raw SQL in controllers is a red flag. Move DB:: calls and large methods to a Service class.',
    severity: 'warning',
    category: 'architecture',
    matches,
  }
}

function extractMethodLengths(content: string): { name: string; length: number; startLine: number }[] {
  const src = lines(content)
  const results: { name: string; length: number; startLine: number }[] = []
  let methodName = '', methodStart = 0, depth = 0, inMethod = false

  src.forEach((line, i) => {
    const fnMatch = line.match(/(?:public|protected|private)\s+(?:static\s+)?function\s+(\w+)\s*\(/)
    if (fnMatch) { methodName = fnMatch[1]; methodStart = i + 1; inMethod = true; depth = 0 }
    if (inMethod) {
      depth += (line.match(/\{/g) || []).length
      depth -= (line.match(/\}/g) || []).length
      if (depth <= 0 && i > methodStart) {
        results.push({ name: methodName, length: i - methodStart, startLine: methodStart })
        inMethod = false
      }
    }
  })
  return results
}

// ─── Rule 3: Query inside loop ────────────────────────────────────────────────

export const queryInLoop: RuleFn = (content, file) => {
  if (isMigrationFile(file) || isTestFile(file)) {
    return { id: 'query-in-loop', title: 'Database query inside loop', description: '', severity: 'error', category: 'database', matches: [] }
  }

  const src = lines(content)
  const matches: RuleMatch[] = []
  let loopDepth = 0, braceDepth = 0, loopBraceDepth = 0

  const loopOpen = /\b(foreach|for|while)\s*\(/
  const queryPattern = /\b(DB::select|DB::table|::find\(|::findOrFail\(|::where\(.*\)->(?:first|get|count|exists)\()/

  src.forEach((line, i) => {
    const opens = (line.match(/\{/g) || []).length
    const closes = (line.match(/\}/g) || []).length
    if (loopOpen.test(line)) { loopDepth++; loopBraceDepth = braceDepth }
    braceDepth += opens - closes
    if (loopDepth > 0 && braceDepth <= loopBraceDepth) loopDepth--
    if (loopDepth > 0 && queryPattern.test(line) && !line.includes('->with(')) {
      matches.push({ file, line: i + 1 })
    }
  })

  return {
    id: 'query-in-loop',
    title: 'Database query inside loop — N+1 risk',
    description: 'Use ->with() to eager load relationships, or collect all records before the loop.',
    severity: 'error',
    category: 'database',
    matches,
  }
}

// ─── Rule 4: DB write inside loop without transaction ────────────────────────
// Only detects the one pattern reliably detectable via regex:
// DB::table()->update/insert/delete or Model::where()->update/delete inside a loop

export const missingTransaction: RuleFn = (content, file) => {
  if (isMigrationFile(file) || isTestFile(file)) {
    return { id: 'missing-transaction', title: '', description: '', severity: 'warning', category: 'database', matches: [] }
  }

  const hasTransaction = /DB::transaction|DB::beginTransaction/.test(content)
  if (hasTransaction) {
    return { id: 'missing-transaction', title: '', description: '', severity: 'warning', category: 'database', matches: [] }
  }

  const src = lines(content)
  const matches: RuleMatch[] = []
  let loopDepth = 0, braceDepth = 0, loopBraceDepth = 0

  // Only flag explicit bulk DB writes inside loops — NOT $model->save()
  const writeInLoopPattern = /\bDB::table\(.*\)->(update|insert|delete)\s*\(|\b[A-Z][a-zA-Z]+::where\(.*\)->(update|delete)\s*\(/

  src.forEach((line, i) => {
    const opens = (line.match(/\{/g) || []).length
    const closes = (line.match(/\}/g) || []).length
    if (/\b(foreach|for|while)\s*\(/.test(line)) { loopDepth++; loopBraceDepth = braceDepth }
    braceDepth += opens - closes
    if (loopDepth > 0 && braceDepth <= loopBraceDepth) loopDepth--
    if (loopDepth > 0 && writeInLoopPattern.test(line)) {
      matches.push({ file, line: i + 1, message: 'DB write inside loop — wrap in DB::transaction()' })
    }
  })

  return {
    id: 'missing-transaction',
    title: 'DB write inside loop without DB::transaction()',
    description: 'Wrap bulk writes in DB::transaction() to ensure atomicity and improve performance.',
    severity: 'warning',
    category: 'database',
    matches,
  }
}

// ─── Rule 5: Sync heavy operation ────────────────────────────────────────────

export const syncHeavyOperation: RuleFn = (content, file) => {
  if (isTestFile(file) || isServiceOrRepo(file)) {
    return { id: 'sync-heavy-operation', title: '', description: '', severity: 'warning', category: 'performance', matches: [] }
  }
  if (!file.includes('/Http/') && !file.includes('Controller')) {
    return { id: 'sync-heavy-operation', title: '', description: '', severity: 'warning', category: 'performance', matches: [] }
  }
  return {
    id: 'sync-heavy-operation',
    title: 'Heavy operation in request cycle — move to Queue',
    description: 'Use Mail::queue(), dispatch(new Job()), or Notification with ShouldQueue.',
    severity: 'warning',
    category: 'performance',
    matches: matchLines(content, file, /\bMail::(?:send|to\b.*->send)\s*\(/),
  }
}

// ─── Rule 6: Hardcoded credentials ───────────────────────────────────────────

export const hardcodedCredentials: RuleFn = (content, file) => {
  if (isTestFile(file)) return { id: 'hardcoded-credentials', title: '', description: '', severity: 'error', category: 'architecture', matches: [] }

  const matches: RuleMatch[] = []
  lines(content).forEach((line, i) => {
    if (/^\s*(\/\/|\*)/.test(line)) return
    if (/env\(|config\(|\$_ENV|\$_SERVER/.test(line)) return
    if (/['"]password['"]\s*=>\s*['"]hashed['"]/.test(line)) return
    if (/['"]password['"]\s*=>\s*['"]bcrypt['"]/.test(line)) return
    if (/^\s*['"]password['"]\s*,/.test(line)) return
    if (/['"]password['"]\s*=>\s*['"][^'"]{6,}['"]/.test(line) ||
        /['"]secret['"]\s*=>\s*['"][^'"]{4,}['"]/.test(line) ||
        /['"]api_key['"]\s*=>\s*['"][^'"]{4,}['"]/.test(line) ||
        /['"]token['"]\s*=>\s*['"][^'"]{8,}['"]/.test(line)) {
      matches.push({ file, line: i + 1 })
    }
  })

  return {
    id: 'hardcoded-credentials',
    title: 'Hardcoded credentials — use env() or config() instead',
    description: 'Never hardcode passwords, secrets, or API keys. Use env("KEY") or config("app.key").',
    severity: 'error',
    category: 'architecture',
    matches,
  }
}

// ─── Rule 7: Missing rate limiting ───────────────────────────────────────────

export const missingRateLimit: RuleFn = (content, file) => {
  if (!file.match(/Controllers?\/.*Controller\.php$/)) {
    return { id: 'missing-rate-limit', title: '', description: '', severity: 'warning', category: 'performance', matches: [] }
  }
  if (/throttle|RateLimiter|rate_limit/.test(content)) {
    return { id: 'missing-rate-limit', title: '', description: '', severity: 'warning', category: 'performance', matches: [] }
  }
  const matches: RuleMatch[] = []
  lines(content).forEach((line, i) => {
    if (/function\s+(login|register|resetPassword|sendOtp|charge|pay|verify)\s*\(/.test(line)) {
      matches.push({ file, line: i + 1 })
    }
  })
  return {
    id: 'missing-rate-limit',
    title: 'Sensitive endpoint missing rate limiting',
    description: 'Add throttle middleware: Route::middleware("throttle:10,1") or use RateLimiter::attempt().',
    severity: 'warning',
    category: 'performance',
    matches,
  }
}

// ─── Rule 8: env() outside config files ──────────────────────────────────────

export const envOutsideConfig: RuleFn = (content, file) => {
  if (file.includes('/config/') || file.includes('.env') || isTestFile(file)) {
    return { id: 'env-outside-config', title: '', description: '', severity: 'warning', category: 'architecture', matches: [] }
  }
  return {
    id: 'env-outside-config',
    title: 'env() called outside config files — use config() instead',
    description: 'env() returns null after config:cache. Always wrap in config files and call via config("key").',
    severity: 'warning',
    category: 'architecture',
    matches: matchLines(content, file, /\benv\s*\(\s*['"]/),
  }
}

export const ALL_RULES: RuleFn[] = [
  debugStatements,
  fatController,
  queryInLoop,
  missingTransaction,
  syncHeavyOperation,
  hardcodedCredentials,
  missingRateLimit,
  envOutsideConfig,
]