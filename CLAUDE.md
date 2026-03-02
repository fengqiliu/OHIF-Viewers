# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

OHIF (Open Health Imaging Foundation) Viewer is a zero-footprint medical imaging viewer for DICOM images. It's a configurable and extensible progressive web application with out-of-the-box support for DICOMweb image archives.

**Key Technologies**: React, TypeScript, Cornerstone3D (medical image rendering), Webpack/rsbuild

## Development Commands

All commands run from root directory:

```bash
# Install dependencies (requires Yarn 1.22.22)
yarn install --frozen-lockfile

# Dev server (uses public cloud PACS by default)
yarn dev
yarn dev:orthanc        # With Orthanc PACS
yarn dev:dcm4chee       # With DCM4CHEE PACS
yarn dev:fast           # rsbuild (faster, recommended for development)

# Testing
yarn test:unit                          # All unit tests with coverage
jest --testPathPattern=<file>           # Single test file
yarn test:e2e                           # Playwright E2E tests

# Build
yarn build              # Production
yarn build:package-all  # Build all packages

# Clean
yarn clean              # Remove build artifacts
yarn clean:deep         # Remove build artifacts and node_modules
```

## Repository Structure

This is a **monorepo** managed by Lerna and Yarn Workspaces (with NX for task caching):

- **`platform/`** - Core infrastructure:
  - `core` - Business logic, services, extension management
  - `ui` - React component library
  - `ui-next` - Next-gen UI components
  - `i18n` - Internationalization
  - `app` - Main viewer entry point

- **`extensions/`** - Modular functionality:
  - `cornerstone` - Image rendering with Cornerstone3D
  - `default` - Basic datasource, panels, toolbar
  - `dicom-sr` - DICOM Structured Report
  - `dicom-seg` - DICOM Segmentation
  - `dicom-rt` - DICOM RTSTRUCT
  - `measurement-tracking` - Longitudinal measurement tracking
  - `tmtv` - Total Metabolic Tumor Volume

- **`modes/`** - Workflow configurations:
  - `basic-dev-mode` - Basic development mode
  - `longitudinal` - Measurement tracking workflow
  - `tmtv` - TMTV calculation mode

## Architecture

### Initialization Flow

`App.tsx` → `appInit.js` which:
1. Creates `CommandsManager`, `ServicesManager`, `HotkeysManager`
2. Registers core services (DisplaySet, Measurement, HangingProtocol, ViewportGrid, Toolbar, etc.)
3. Creates `ExtensionManager` and registers extensions
4. Builds routes from mode definitions via `buildModeRoutes.tsx`

### Extension Module Types

Extensions export typed modules via `MODULE_TYPES` (`platform/core/src/extensions/MODULE_TYPES.js`):

| Module | Key | Purpose |
|--------|-----|---------|
| `commandsModule` | COMMANDS | Registerable actions |
| `viewportModule` | VIEWPORT | Viewport rendering components |
| `panelModule` | PANEL | Side panel components |
| `toolbarModule` | TOOLBAR | Toolbar button definitions |
| `hangingProtocolModule` | HANGING_PROTOCOL | Display layout rules |
| `sopClassHandlerModule` | SOP_CLASS_HANDLER | DICOM SOP class → DisplaySet mapping |
| `dataSourcesModule` | DATA_SOURCE | PACS/data fetching adapters |
| `customizationModule` | CUSTOMIZATION | UI customization overrides |
| `contextModule` | CONTEXT | React context providers |
| `layoutTemplateModule` | LAYOUT_TEMPLATE | Layout template definitions |
| `utilityModule` | UTILITY | Shared utility functions |
| `stateSyncModule` | STATE_SYNC | Cross-viewport state synchronization |

### Core Services

Located in `platform/core/src/services/`:
- `DisplaySetService` - Manages image display sets derived from DICOM series
- `MeasurementService` - Tracks annotations/measurements across studies
- `HangingProtocolService` - Applies layout rules to viewports (display sets, viewport arrangement, window level presets)
- `ViewportGridService` - Controls viewport grid layout
- `ToolBarService` - Manages toolbar state and button definitions
- `CustomizationService` - Runtime UI customization (theming, component overrides)
- `DicomMetadataStore` - Stores and retrieves DICOM metadata

### Modes

A mode is a configuration object that declares which extensions to use, the layout, routes, and tool groups. Modes extend/compose each other (e.g., `longitudinal` extends `basic`). The mode's `modeInstance` provides `routes`, `extensions`, and lifecycle hooks (`onModeEnter`/`onModeExit`).

### Route Flow

When a mode route activates (`platform/app/src/routes/Mode/Mode.tsx`):
1. Loads the mode's layout definition
2. Initializes tool groups from extension configurations
3. Wires up extension modules (commands, panels, viewports)
4. Applies hanging protocol to arrange display sets in viewports

### Adding New Features

#### Adding Toolbar Buttons
Toolbar buttons are defined in mode directories (e.g., `modes/basic/src/toolbarButtons.ts`), not in extensions. Buttons use the `evaluate` property to conditionally enable/disable based on viewport state.

#### Adding Commands
Commands are registered in extensions' `commandsModule.ts`. Each command has:
- An `action` function that implements the logic
- A `definition` that maps the command name to the action

Example structure:
```typescript
const actions = {
  myCommand: ({ viewportId, ...params }) => {
    // Implementation
  }
};

const definitions = {
  myCommand: {
    commandFn: actions.myCommand,
    options: {},
  }
};
```

#### Internationalization
Add translation keys to `platform/i18n/src/locales/en-US/Buttons.json` and other language files. Use `i18n.t('Buttons:Key')` in toolbar button definitions.

## Testing

### Unit Tests (Jest)
- Config: `jest.config.js` → `jest.config.base.js` → per-package `jest.config.js`
- Tests co-located: `foo.ts` → `foo.test.ts`
- Run single file: `jest --testPathPattern=path/to/file.test.ts`
- Watch mode: `yarn test-watch`

### E2E Tests (Playwright)
- Located in `tests/`, config: `playwright.config.ts`
- Runs against local server on port 3335
- Use `data-cy` attributes for selectors
- Run with UI: `yarn test:e2e:ui`
- Debug mode: `yarn test:e2e:debug`

## Maintenance

- `yarn clean` - Remove build artifacts
- `yarn clean:deep` - Remove build artifacts and node_modules
- `yarn see-changed` - List packages changed since last release
- NX caches builds/tests - run `yarn clean` if stale cache issues occur

## Requirements

- Node.js 18+, Yarn 1.22.22
- Enable workspaces: `yarn config set workspaces-experimental true`
- Use `--frozen-lockfile` flag for `yarn install` to ensure reproducible dependencies

## Important Notes

- The project uses both `.ts` and `.js` files - don't confuse compiled `.js` files with source files
- If you see build errors about duplicate files, run `yarn clean` to clear build artifacts
- Use `yarn dev:fast` for faster development builds (uses rsbuild instead of webpack)
- Port 3000 is used by default; if occupied, the server will use the next available port

## Updating Dependencies

- `yarn install:update-lockfile` - Updates both yarn.lock and bun.lock
- `yarn audit` - Run security audit (ignores GHSA-5j98-mcp5-4vw2)
