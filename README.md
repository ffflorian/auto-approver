# auto-approver [![Build Status](https://action-badges.now.sh/ffflorian/auto-approver)](https://github.com/ffflorian/auto-approver/actions/) [![npm version](https://img.shields.io/npm/v/ffflorian/auto-approver.svg?style=flat)](https://www.npmjs.com/package/ffflorian/auto-approver) [![Dependabot Status](https://api.dependabot.com/badges/status?host=github&repo=ffflorian/auto-approver)](https://dependabot.com)

Automatically approve all GitHub PRs which match a specific pattern.

## Installation

Run `yarn global add auto-approver` or `npm i -g auto-approver`.

## Usage

### CLI

```
Usage: auto-approver [options]

Automatically approve all GitHub PRs which match a specific pattern.

Options:
  -c, --config <path>  specify a configuration file (default: .approverrc.json)
  -V, --version        output the version number
  -h, --help           output usage information
```

### Configuration file

To use a configuration file, add a configuration file following the [cosmiconfig standard](https://github.com/davidtheclark/cosmiconfig#cosmiconfig) (e.g. `.approverrc.json`) to your project and the auto-approver will find it automatically. Options from the CLI still take precedence over the configuration file.

The structure of the configuration file is the following:

```ts
{
  /** The GitHub auth token */
  authToken: string;
  /** All projects to include */
  projects: {
    /** All projects hosted on GitHub in the format `user/repo` */
    gitHub: string[];
  };
  verbose?: boolean;
}
```

If you would like to use a custom configuration file, start the CLI with the option `--config <file>`.

### Configuration file examples

- [JSON configuration example](./.approverrc.example.json)
