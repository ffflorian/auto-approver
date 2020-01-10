# auto-approver [![Build Status](https://action-badges.now.sh/ffflorian/auto-approver)](https://github.com/ffflorian/auto-approver/actions/) [![npm version](https://img.shields.io/npm/v/ffflorian/auto-approver.svg?style=flat)](https://www.npmjs.com/package/ffflorian/auto-approver) [![Dependabot Status](https://api.dependabot.com/badges/status?host=github&repo=ffflorian/auto-approver)](https://dependabot.com)

A zip CLI based on [jszip](https://www.npmjs.com/package/jszip).

## Installation

Run `yarn global add auto-approver` or `npm i -gauto-approver`.

## Usage

### CLI

```

```

### Configuration file

To use a configuration file, add a configuration file following the [cosmiconfig standard](https://github.com/davidtheclark/cosmiconfig#cosmiconfig) (e.g. `.jsziprc.json`) to your project and the JSZip CLI will find it automatically. Options from the CLI still take precedence over the configuration file.

The structure of the configuration file is the following:

```ts
{
  /** The compression level to use (0 = save only, 9 = best compression) (default: 5). */
  compressionLevel?: number;

  /** Use a configuration file (default: .jsziprc.json). */
  configFile?: string | boolean;

  /** Whether to dereference (follow) symlinks (default: false). */
  dereferenceLinks?: boolean;

  /** Which files or directories to add. */
  entries: string[];

  /** Force overwriting files and directories when extracting (default: false). */
  force?: boolean;

  /** Ignore entries (e.g. `*.js.map`). */
  ignoreEntries?: Array<string | RegExp>;

  /** Add or extract files. */
  mode: 'add' | 'extract';

  /** Set the output directory (default: stdout). */
  outputEntry?: string | null;

  /** Don't log anything excluding errors (default: false). */
  quiet?: boolean;

  /** Enable verbose logging (default: false). */
  verbose?: boolean;
}
```

If you would like to use a custom configuration file, start the CLI with the option `--config <file>`.

## Examples

### CLI examples

```
jszip-cli add --ignore *.map --output deploy.zip dist/ package.json

jszip-cli add --ignore *.map dist/ package.json > deploy.zip

jszip-cli extract --output deployment_files/ deploy.zip
```

### Configuration file examples

- [JSON configuration example](./config-examples/.jsziprc.example.json)
- [JavaScript configuration example](./config-examples/.jsziprc.example.js)
