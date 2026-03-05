import pc from 'picocolors'
import type { ScanResult } from './types'

// Strip ANSI escape codes to get true visible length
function stripAnsi(str: string): string {
  return str.replace(/\x1B\[[0-9;]*m/g, '')
}

export function report(result: ScanResult, verbose: boolean): void {
  const { rules, totalFiles, scannedFiles, duration, score } = result

  if (rules.length === 0) {
    console.log(pc.green('✔ No issues found!'))
  } else {
    for (const rule of rules) {
      const count = rule.matches.length
      const icon = rule.severity === 'error' ? pc.red('✗') : pc.yellow('△')
      const label = rule.severity === 'error' ? pc.red(rule.title) : pc.yellow(rule.title)
      const num = rule.severity === 'error' ? pc.red(`(${count})`) : pc.yellow(`(${count})`)

      console.log(`  ${icon} ${label} ${num}`)
      console.log(`    ${pc.dim(rule.description)}`)

      if (verbose) {
        // Paths are already normalized to relative in scanner.ts — no need to strip again
        const byFile = rule.matches.reduce<Record<string, number[]>>((acc, m) => {
          ; (acc[m.file] ??= []).push(m.line)
          return acc
        }, {})
        for (const [file, lineNums] of Object.entries(byFile)) {
          console.log(`    ${pc.cyan(file)}: ${lineNums.join(', ')}`)
        }
      }
      console.log()
    }
  }

  const errors = rules.filter(r => r.severity === 'error').reduce((s, r) => s + r.matches.length, 0)
  const warnings = rules.filter(r => r.severity === 'warning').reduce((s, r) => s + r.matches.length, 0)
  const filled = Math.round(score / 5)
  const bar = pc.green('█'.repeat(filled)) + pc.dim('░'.repeat(20 - filled))
  const grade = score >= 90 ? pc.green('Great') : score >= 70 ? pc.yellow('Needs work') : pc.red('Critical')
  const scoreStr = score >= 90 ? pc.green(`${score} / 100`) : score >= 70 ? pc.yellow(`${score} / 100`) : pc.red(`${score} / 100`)

  const W = 43
  const pad = (s: string, len: number) => s + ' '.repeat(Math.max(0, len - stripAnsi(s).length))

  const line1 = pad('  laravel-doctor', W)
  const line2 = pad(`  ${scoreStr}   ${grade}`, W)
  const line3 = pad(`  ${bar}`, W)
  const line4 = pad(`  ${pc.red(`✗ ${errors} errors`)}  ${pc.yellow(`△ ${warnings} warnings`)}`, W)
  const line5 = pad(`  ${pc.dim(`across ${scannedFiles}/${totalFiles} files  in ${duration}ms`)}`, W)

  console.log('🩺 ' + pc.bold('Laravel Doctor'))
  console.log(pc.dim('┌' + '─'.repeat(W) + '┐'))
  console.log(pc.dim('│') + line1 + pc.dim('│'))
  console.log(pc.dim('│') + ' '.repeat(W) + pc.dim('│'))
  console.log(pc.dim('│') + line2 + pc.dim('│'))
  console.log(pc.dim('│') + line3 + pc.dim('│'))
  console.log(pc.dim('│') + ' '.repeat(W) + pc.dim('│'))
  console.log(pc.dim('│') + line4 + pc.dim('│'))
  console.log(pc.dim('│') + line5 + pc.dim('│'))
  console.log(pc.dim('└' + '─'.repeat(W) + '┘'))
  console.log()
}