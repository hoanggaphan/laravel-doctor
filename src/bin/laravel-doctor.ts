#!/usr/bin/env node
import { Command } from 'commander'
import pc from 'picocolors'
import { scan } from '../scanner'
import { report } from '../reporter'

const program = new Command()

program
  .name('laravel-doctor')
  .description('Static analysis for Laravel — detect architectural anti-patterns')
  .version('0.1.0')
  .argument('[directory]', 'Laravel project directory', '.')
  .option('-v, --verbose', 'Show file paths and line numbers', false)
  .option('--only <category>', 'Only run rules for a category: database|concurrency|architecture|performance')
  .action(async (dir: string, opts: { verbose: boolean; only?: string }) => {
    console.log()
    console.log(pc.bold('laravel-doctor') + pc.dim(' v0.1.0'))
    console.log()
    console.log(pc.green('✔') + ` Scanning ${pc.cyan(dir)}...`)

    const result = await scan(dir)

    console.log(pc.green('✔') + ` Found ${pc.bold(String(result.totalFiles))} PHP files.`)
    console.log(pc.green('✔') + ' Running checks.')
    console.log()

    report(result, opts.verbose)

    // Exit with error code if errors found
    const hasErrors = result.rules.some(r => r.severity === 'error' && r.matches.length > 0)
    process.exit(hasErrors ? 1 : 0)
  })

program.parse()