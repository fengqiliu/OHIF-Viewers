# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

OHIF (Open Health Imaging Foundation) Viewer is a zero-footprint medical imaging viewer for DICOM images. It's a configurable and extensible progressive web application with out-of-the-box support for DICOMweb image archives.

**Key Technologies**: React, TypeScript, Cornerstone3D (medical image rendering), Webpack/rsbuild, Lerna/Yarn Workspaces

## Development Commands

All commands run from root directory:

```bash
# Install dependencies (requires Yarn 1.22.22)
yarn install --frozen-lockfile

# Dev server (uses public cloud PACS by default)
yarn dev
yarn dev:orthanc        # With Orthanc PACS (local Docker)
yarn dev:dcm4chee       # With DCM4CHEE PACS
yarn dev:fast           # rsbuild (faster, recommended for development)
yarn dev:static         # Serve static files

# Start local Orthanc for testing
yarn orthanc:up

# Testing
yarn test:unit                          # All unit tests with coverage
jest --testPathPattern=<file>           # Single test file
yarn test-watch                         # Watch mode
yarn test:e2e                           # Playwright E2E tests
yarn test:e2e:ui                        # E2E with UI
yarn test:e2e:debug                     # E2E debug mode

# Build
yarn build              # Production build
yarn build:dev          # Development build
yarn build:qa            # QA build
yarn build:ci           # CI build
yarn build:package-all  # Build all packages
yarn build:demo         # Demo build

# Clean
yarn clean              # Remove build artifacts
yarn clean:deep         # Remove build artifacts and node_modules

# Maintenance
yarn see-changed        # List changed packages since last release
yarn audit              # Security audit
```

## Repository Structure

This is a **monorepo** managed by Lerna and Yarn Workspaces (with NX for task caching):

```
Viewers/
├── platform/              # Core infrastructure
│   ├── core/             # Business logic, services, extension management
│   ├── ui/               # React component library
│   ├── ui-next/          # Next-gen UI components
│   ├── i18n/             # Internationalization (locales in src/locales/)
│   ├── app/              # Main viewer entry point (routes, config)
│   ├── cli/              # CLI tools
│   └── docs/             # Documentation site
├── extensions/           # Modular functionality (17+ extensions)
│   ├── cornerstone/      # Image rendering with Cornerstone3D
│   ├── cornerstone-dicom-sr/   # DICOM Structured Report
│   ├── cornerstone-dicom-seg/   # DICOM Segmentation
│   ├── cornerstone-dicom-rt/    # DICOM RTSTRUCT
│   ├── cornerstone-dicom-pmap/  # DICOM Parametric Map
│   ├── cornerstone-dynamic-volume/  # 4D volume
│   ├── default/          # Basic datasource, panels, toolbar
│   ├── measurement-tracking/    # Longitudinal measurements
│   ├── tmtv/            # Total Metabolic Tumor Volume
│   ├── dicom-video/     # DICOM Video
│   ├── dicom-pdf/       # DICOM PDF
│   └── dicom-microscopy/ # Whole Slide Microscopy
├── modes/                # Workflow configurations (11+ modes)
│   ├── basic/            # Basic viewer mode
│   ├── longitudinal/     # Measurement tracking workflow
│   ├── tmtv/            # TMTV calculation mode
│   ├── microscopy/      # Microscopy mode
│   └── segmentation/    # Segmentation mode
├── addOns/               # Optional external dependencies
│   └── externals/       # External libraries
├── tests/               # E2E tests (Playwright)
└── .recipes/            # Docker configurations
```

**Key directories:**
- `platform/core/src/extensions/` - Extension system implementation
- `platform/core/src/services/` - Core services
- `platform/ui/src/components/` - Reusable UI components
- `extensions/*/src/` - Extension source code
- `modes/*/src/` - Mode configurations

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

#### Adding a New Extension
1. Create extension in `extensions/` directory
2. Define `getModuleModule()` returning typed modules
3. Register in mode's `id` array (e.g., `modes/basic/src/index.ts`)

#### Adding a New Mode
1. Create mode in `modes/` directory
2. Define `id`, `routeName`, `extensions`, `layout`, `toolbarButtons`
3. Add to `buildModeRoutes.tsx` or register via config

#### Internationalization
Add translation keys to `platform/i18n/src/locales/en-US/Buttons.json` and other language files. Use `i18n.t('Buttons:Key')` in toolbar button definitions.

### Key Files and Entry Points

- `platform/app/src/App.tsx` - Main application entry
- `platform/app/src/routes/index.tsx` - Route definitions
- `platform/app/src/init.ts` / `appInit.js` - Application initialization
- `platform/core/src/extensions/ExtensionManager.ts` - Extension loading
- `platform/core/src/extensions/MODULE_TYPES.ts` - Extension type definitions
- `modes/*/src/index.ts` - Mode configuration
- `extensions/*/src/index.ts` - Extension module exports

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

### Git Workflow
- Always verify git operations complete successfully before reporting completion
- If network issues occur during push/pull, inform the user and suggest manual retry
- After commit, verify with `git status` before proceeding

### Infrastructure Checks
- The project requires Node.js 18+ and Yarn 1.22.22
- Ensure no other process is using port 3000 before running dev server
- If port is in use, the server will automatically use the next available port

### Docker for Local PACS
- Use `yarn orthanc:up` to start local Orthanc PACS with test data
- Docker must be running on the host machine
- Configuration: `platform/app/.recipes/Nginx-Orthanc/docker-compose.yml`

### Build Issues
- The project uses both `.ts` and `.js` files - don't confuse compiled `.js` files with source files
- If you see build errors about duplicate files, run `yarn clean` to clear build artifacts
- Use `yarn dev:fast` for faster development builds (uses rsbuild instead of webpack)
- Port 3000 is used by default; if occupied, the server will use the next available port

### Data Flow
1. User loads study → `dataSourcesModule` fetches DICOM metadata
2. `SopClassHandlerModule` maps SOP classes to DisplaySets
3. `DisplaySetService` creates display sets from series
4. `HangingProtocolService` applies layout rules
5. `ViewportGridService` arranges display sets in viewports
6. `viewportModule` renders images via Cornerstone3D

### Extension Configuration
Extensions are configured in mode files. Each mode specifies:
- Which extensions to load via `extensions` array
- Layout template via `layoutTemplateModule`
- Tool groups via `toolbarButtons` or mode config

## Updating Dependencies

- `yarn install:update-lockfile` - Updates both yarn.lock and bun.lock
- `yarn audit` - Run security audit (ignores GHSA-5j98-mcp5-4vw2)

## Local Customizations

This codebase has been customized with the following features:

### AdvancedRenderingControls
A mouse-aware floating toolbar that auto-hides after 3 seconds and reappears when the mouse approaches the viewport edges. Located at `extensions/cornerstone/src/components/AdvancedRenderingControls/`. Supports positioning at TopMiddle, BottomMiddle, LeftMiddle, RightMiddle.

### VR Volume Rendering
- One-click patient table removal for VR volume rendering
- Enhanced volume rendering controls in the cornerstone extension

### Dynamic Volume Panel
Image generation panel for 4D dynamic volumes at `extensions/cornerstone-dynamic-volume/src/panels/PanelGenerateImage.tsx`

### Modified Toolbar Buttons
Custom toolbar configurations in:
- `modes/basic/src/toolbarButtons.ts`
- `modes/segmentation/src/toolbarButtons.ts`
- `modes/tmtv/src/toolbarButtons.ts`

### Key Modified Extensions
- `extensions/cornerstone/src/` - Core rendering, segmentation, viewport services
- `extensions/cornerstone-dicom-pmap/src/` - Parametric map SOP handler
- `extensions/cornerstone-dicom-sr/src/tools/` - DICOM SR display tool
- `extensions/dicom-video/src/` - Video SOP handler
