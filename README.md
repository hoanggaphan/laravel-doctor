# laravel-doctor 🩺
> Static analysis CLI for Laravel — detect architectural anti-patterns, not just type errors.

Tested on **Laravel 12**.

```bash
npx laravel-doctor@latest . --verbose
```

---

## Scoring

**X / 100** — each error deducts 4pts, each warning deducts 1.5pts.

| Score | Grade |
|-------|-------|
| 90–100 | ✅ Great |
| 70–89 | ⚠️ Needs work |
| 0–69 | ❌ Critical |

---

## Rules

> **Different from PHPStan/Larastan** — PHPStan checks *type safety*, laravel-doctor checks *architectural patterns*: the things a type checker doesn't care about but a senior dev spots immediately.

---

### 🧠 Database

| Rule | ID | Severity | Detects |
|------|----|----------|---------|
| Query inside loop (N+1) | `query-in-loop` | ❌ error | `DB::select/table`, `::find()`, `::where()->first/get/count/exists()` inside `foreach/for/while` |
| DB write inside loop | `missing-transaction` | ⚠️ warning | `DB::table()->update/insert/delete` or `Model::where()->update/delete` inside a loop without `DB::transaction()` |

**Not detectable via regex (requires AST):**
- `$model->save()` inside a loop — can't distinguish variable scope
- Multi-model writes without transaction — requires per-method call tracking

---

### 🏛️ Architecture

| Rule | ID | Severity | Detects |
|------|----|----------|---------|
| Raw SQL in Controller | `fat-controller` | ⚠️ warning | `DB::select/insert/update/delete/statement` directly inside `*Controller.php` files |
| Oversized Controller method | `fat-controller` | ⚠️ warning | Methods > 50 lines in a Controller |
| Debug statement in code | `debug-statements` | ❌ error | `dd()`, `dump()`, `var_dump()`, `ray()` outside of test files |
| Hardcoded credentials | `hardcoded-credentials` | ❌ error | `'password' => 'value'`, `'secret' => 'value'`, `'api_key' => 'value'` hardcoded directly (ignores `$casts`, `$hidden`, `$fillable`) |
| env() outside config files | `env-outside-config` | ⚠️ warning | `env('KEY')` called outside `config/` directory — returns `null` after `php artisan config:cache` |

---

### 🚀 Performance

| Rule | ID | Severity | Detects |
|------|----|----------|---------|
| Heavy operation in request cycle | `sync-heavy-operation` | ⚠️ warning | `Mail::send()`, `Mail::to()->send()` called directly in the `Http/` layer instead of a Queue |
| Sensitive endpoint missing rate limit | `missing-rate-limit` | ⚠️ warning | Methods named `login`, `register`, `resetPassword`, `sendOtp`, `charge`, `pay`, `verify` in a Controller without `throttle` or `RateLimiter` |

---

## What the tool intentionally does NOT flag

- `$model->save()` + `$model->refresh()` — standard Laravel CRUD pattern
- `new Model($data)` + `->save()` — single model create, no transaction needed
- Standalone `Model::create([...])` — not a multi-write operation
- `TableRule::TYPE_DONT_ALLOW` — constant access, not a DB write
- `'password' => 'hashed'` in `$casts` — Laravel cast definition
- `'password'` in `$hidden` or `$fillable` — field name declaration only
- Anything inside `vendor/`, `storage/`, `public/`, `bootstrap/cache/`
- `dd()` inside test files
- `Mail::send()` inside Jobs, Listeners, or Services

---

## Sample Output

```
laravel-doctor v0.1.0

✔ Scanning /path/to/laravel-app...
✔ Found 79 PHP files.
✔ Running checks.

  △ Business logic in Controller — move to Service layer (1)
    Raw SQL in controllers is a red flag. Move DB:: calls and large methods to a Service class.
    app/Http/Controllers/V1/AvailabilitiesController.php: 185

  ✗ Database query inside loop — N+1 risk (2)
    Use ->with() to eager load relationships, or collect all records before the loop.
    app/Services/AvailabilitiesService.php: 728
    app/Repositories/TableRepository.php: 153

┌─────────────────────────────────────────┐
│ 🩺 Laravel Doctor                       │
│                                         │
│  91 / 100   Great                       │
│  ████████████████░░░░                   │
│                                         │
│  ✗ 2 errors  △ 1 warning               │
│  across 79/79 files  in 42ms            │
└─────────────────────────────────────────┘
```

---

## Usage

```bash
# Scan current directory
npx laravel-doctor@latest .

# Show file paths and line numbers
npx laravel-doctor@latest . --verbose

# Scan a specific directory
npx laravel-doctor@latest /path/to/laravel-app --verbose
```

---

## Scanned Directories

Only scans: `app/`, `src/`, `routes/`, `config/`, `database/`

Never scans: `vendor/`, `node_modules/`, `storage/`, `public/`, `bootstrap/cache/`

---

## Comparison with Other Tools

| | laravel-doctor | PHPStan / Larastan | PHP_CodeSniffer |
|---|---|---|---|
| Type safety | ❌ | ✅ | ❌ |
| Architectural patterns | ✅ | ❌ | ❌ |
| N+1 detection | ✅ | ❌ | ❌ |
| Fat controller | ✅ | ❌ | ⚠️ partial |
| Hardcoded secrets | ✅ | ❌ | ❌ |
| Zero config to run | ✅ (`npx`) | ❌ | ❌ |

**Recommended:** use laravel-doctor alongside PHPStan — they complement each other.

---

## Roadmap

- [ ] **v0.2** — AST-based parsing via `nikic/php-parser` for accurate multi-model transaction detection and variable scope tracking
- [ ] **v0.2** — `Cache::get()` + `Cache::put()` race condition detection
- [ ] **v0.2** — `Http::get/post()` without try/catch
- [ ] **v0.3** — `--only=database` filter by category
- [ ] **v0.3** — JSON output for CI/CD pipelines
- [ ] **v0.3** — GitHub Actions integration