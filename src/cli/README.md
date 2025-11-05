# CLI Module

This module has been refactored following SOLID principles, DRY, and clean architecture patterns.

## Architecture

The CLI is now organized into focused, single-responsibility modules:

### Core Modules

- **`cli.ts`** - Main entry point and orchestrator (70 lines, down from 1239)
  - Thin coordinator that delegates to specialized modules
  - Handles high-level flow: parse → load → resolve → execute

- **`arg-parser.ts`** - Command-line argument parsing
  - Encapsulates argument parsing logic in `ArgumentParser` class
  - Validates arguments and tracks which were explicitly provided
  - Single responsibility: transform `string[]` → `ParsedArgs`

- **`config.ts`** - Configuration file management
  - Loads config from `~/.terminal-worktree/config.json`
  - Normalizes various config formats (supports aliases and nested structures)
  - Saves config back to disk
  - Single responsibility: file config I/O and normalization

- **`config-resolver.ts`** - Configuration resolution
  - Merges CLI arguments with file config
  - Applies precedence rules (CLI > file > defaults)
  - Validates cross-field constraints (e.g., ngrok requires both key and domain)
  - Single responsibility: resolve final configuration

- **`validation.ts`** - Reusable validation utilities
  - Port validation, string validation, enum validation
  - Generic `pickFirst` function eliminates duplication
  - Centralized warning messages
  - Single responsibility: validate and coerce config values

- **`plans-command.ts`** - Plans subcommand handler
  - Handles `plans list` and `plans show` subcommands
  - Self-contained with its own help text and parsing
  - Single responsibility: plans command functionality

- **`server-starter.ts`** - Server initialization
  - Configures and starts the HTTP server
  - Sets up shutdown handlers
  - Displays startup information
  - Single responsibility: server lifecycle management

- **`help.ts`** - User-facing output
  - Help text display
  - Version display
  - Single responsibility: CLI documentation

### Supporting Modules

- **`types.ts`** - TypeScript type definitions
  - Shared interfaces for configuration
  - Type safety across modules

- **`constants.ts`** - Shared constants
  - Valid values for enums
  - Config file paths
  - Eliminates magic strings

## Design Principles Applied

### SOLID

1. **Single Responsibility**
   - Each module has one reason to change
   - `arg-parser` only parses arguments
   - `config` only handles file I/O
   - `validation` only validates values

2. **Open/Closed**
   - New validation types can be added without modifying existing code
   - New commands can be added alongside existing ones
   - Configuration sources can be extended

3. **Liskov Substitution**
   - Validation functions follow consistent interfaces
   - Config sources are interchangeable

4. **Interface Segregation**
   - Small, focused interfaces (e.g., `PlansOptions`, `ResolvedConfig`)
   - Modules depend only on what they need

5. **Dependency Inversion**
   - High-level `cli.ts` depends on abstractions (exported functions)
   - Low-level modules (validation, I/O) are independent

### DRY (Don't Repeat Yourself)

- Eliminated repetitive config normalization patterns
- Consolidated validation logic into reusable functions
- Generic `pickFirst` and `resolveValue` functions
- Reduced code from 1239 lines to ~800 total (across all modules)

### Clean Architecture

- **Separation of Concerns**: Each module addresses one aspect
- **Dependency Direction**: Dependencies flow inward (validation ← config ← resolver ← cli)
- **Testability**: Each module can be tested in isolation
- **Clarity**: Module names clearly indicate purpose

## Usage

The public API remains unchanged. Import from the main CLI file:

```typescript
import { main, parseArgs } from './cli.js';
```

Or import from the module for more granular control:

```typescript
import { loadConfig, saveConfig } from './cli/config.js';
import { parseArgs } from './cli/arg-parser.js';
import { resolveConfig } from './cli/config-resolver.js';
```

## Benefits

1. **Maintainability**: Easier to locate and modify specific functionality
2. **Testability**: Each module can be unit tested independently
3. **Readability**: Smaller files with clear responsibilities
4. **Extensibility**: New features can be added without touching unrelated code
5. **Reusability**: Validation and config utilities can be used elsewhere
6. **Type Safety**: Strong typing throughout with shared type definitions

## Migration Notes

- All existing CLI flags and behaviors are preserved
- Config file format is unchanged
- Exit codes and error messages remain the same
- No breaking changes to the public API


