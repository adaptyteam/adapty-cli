adapty-cli
=================

Adapty command line interface


[![oclif](https://img.shields.io/badge/cli-oclif-brightgreen.svg)](https://oclif.io)
[![Version](https://img.shields.io/npm/v/adapty-cli.svg)](https://npmjs.org/package/adapty-cli)
[![Downloads/week](https://img.shields.io/npm/dw/adapty-cli.svg)](https://npmjs.org/package/adapty-cli)


<!-- toc -->
* [Usage](#usage)
* [Commands](#commands)
<!-- tocstop -->
# Usage
<!-- usage -->
```sh-session
$ npm install -g adapty-cli
$ adapty COMMAND
running command...
$ adapty (--version)
adapty-cli/0.0.0 darwin-arm64 node-v24.12.0
$ adapty --help [COMMAND]
USAGE
  $ adapty COMMAND
...
```
<!-- usagestop -->
# Commands
<!-- commands -->
* [`adapty hello PERSON`](#adapty-hello-person)
* [`adapty hello world`](#adapty-hello-world)
* [`adapty help [COMMAND]`](#adapty-help-command)
* [`adapty plugins`](#adapty-plugins)
* [`adapty plugins add PLUGIN`](#adapty-plugins-add-plugin)
* [`adapty plugins:inspect PLUGIN...`](#adapty-pluginsinspect-plugin)
* [`adapty plugins install PLUGIN`](#adapty-plugins-install-plugin)
* [`adapty plugins link PATH`](#adapty-plugins-link-path)
* [`adapty plugins remove [PLUGIN]`](#adapty-plugins-remove-plugin)
* [`adapty plugins reset`](#adapty-plugins-reset)
* [`adapty plugins uninstall [PLUGIN]`](#adapty-plugins-uninstall-plugin)
* [`adapty plugins unlink [PLUGIN]`](#adapty-plugins-unlink-plugin)
* [`adapty plugins update`](#adapty-plugins-update)

## `adapty hello PERSON`

Say hello

```
USAGE
  $ adapty hello PERSON -f <value>

ARGUMENTS
  PERSON  Person to say hello to

FLAGS
  -f, --from=<value>  (required) Who is saying hello

DESCRIPTION
  Say hello

EXAMPLES
  $ adapty hello friend --from oclif
  hello friend from oclif! (./src/commands/hello/index.ts)
```

_See code: [src/commands/hello/index.ts](https://github.com/Developer/adapty-cli/blob/v0.0.0/src/commands/hello/index.ts)_

## `adapty hello world`

Say hello world

```
USAGE
  $ adapty hello world

DESCRIPTION
  Say hello world

EXAMPLES
  $ adapty hello world
  hello world! (./src/commands/hello/world.ts)
```

_See code: [src/commands/hello/world.ts](https://github.com/Developer/adapty-cli/blob/v0.0.0/src/commands/hello/world.ts)_

## `adapty help [COMMAND]`

Display help for adapty.

```
USAGE
  $ adapty help [COMMAND...] [-n]

ARGUMENTS
  [COMMAND...]  Command to show help for.

FLAGS
  -n, --nested-commands  Include all nested commands in the output.

DESCRIPTION
  Display help for adapty.
```

_See code: [@oclif/plugin-help](https://github.com/oclif/plugin-help/blob/v6.2.37/src/commands/help.ts)_

## `adapty plugins`

List installed plugins.

```
USAGE
  $ adapty plugins [--json] [--core]

FLAGS
  --core  Show core plugins.

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  List installed plugins.

EXAMPLES
  $ adapty plugins
```

_See code: [@oclif/plugin-plugins](https://github.com/oclif/plugin-plugins/blob/v5.4.56/src/commands/plugins/index.ts)_

## `adapty plugins add PLUGIN`

Installs a plugin into adapty.

```
USAGE
  $ adapty plugins add PLUGIN... [--json] [-f] [-h] [-s | -v]

ARGUMENTS
  PLUGIN...  Plugin to install.

FLAGS
  -f, --force    Force npm to fetch remote resources even if a local copy exists on disk.
  -h, --help     Show CLI help.
  -s, --silent   Silences npm output.
  -v, --verbose  Show verbose npm output.

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  Installs a plugin into adapty.

  Uses npm to install plugins.

  Installation of a user-installed plugin will override a core plugin.

  Use the ADAPTY_NPM_LOG_LEVEL environment variable to set the npm loglevel.
  Use the ADAPTY_NPM_REGISTRY environment variable to set the npm registry.

ALIASES
  $ adapty plugins add

EXAMPLES
  Install a plugin from npm registry.

    $ adapty plugins add myplugin

  Install a plugin from a github url.

    $ adapty plugins add https://github.com/someuser/someplugin

  Install a plugin from a github slug.

    $ adapty plugins add someuser/someplugin
```

## `adapty plugins:inspect PLUGIN...`

Displays installation properties of a plugin.

```
USAGE
  $ adapty plugins inspect PLUGIN...

ARGUMENTS
  PLUGIN...  [default: .] Plugin to inspect.

FLAGS
  -h, --help     Show CLI help.
  -v, --verbose

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  Displays installation properties of a plugin.

EXAMPLES
  $ adapty plugins inspect myplugin
```

_See code: [@oclif/plugin-plugins](https://github.com/oclif/plugin-plugins/blob/v5.4.56/src/commands/plugins/inspect.ts)_

## `adapty plugins install PLUGIN`

Installs a plugin into adapty.

```
USAGE
  $ adapty plugins install PLUGIN... [--json] [-f] [-h] [-s | -v]

ARGUMENTS
  PLUGIN...  Plugin to install.

FLAGS
  -f, --force    Force npm to fetch remote resources even if a local copy exists on disk.
  -h, --help     Show CLI help.
  -s, --silent   Silences npm output.
  -v, --verbose  Show verbose npm output.

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  Installs a plugin into adapty.

  Uses npm to install plugins.

  Installation of a user-installed plugin will override a core plugin.

  Use the ADAPTY_NPM_LOG_LEVEL environment variable to set the npm loglevel.
  Use the ADAPTY_NPM_REGISTRY environment variable to set the npm registry.

ALIASES
  $ adapty plugins add

EXAMPLES
  Install a plugin from npm registry.

    $ adapty plugins install myplugin

  Install a plugin from a github url.

    $ adapty plugins install https://github.com/someuser/someplugin

  Install a plugin from a github slug.

    $ adapty plugins install someuser/someplugin
```

_See code: [@oclif/plugin-plugins](https://github.com/oclif/plugin-plugins/blob/v5.4.56/src/commands/plugins/install.ts)_

## `adapty plugins link PATH`

Links a plugin into the CLI for development.

```
USAGE
  $ adapty plugins link PATH [-h] [--install] [-v]

ARGUMENTS
  PATH  [default: .] path to plugin

FLAGS
  -h, --help          Show CLI help.
  -v, --verbose
      --[no-]install  Install dependencies after linking the plugin.

DESCRIPTION
  Links a plugin into the CLI for development.

  Installation of a linked plugin will override a user-installed or core plugin.

  e.g. If you have a user-installed or core plugin that has a 'hello' command, installing a linked plugin with a 'hello'
  command will override the user-installed or core plugin implementation. This is useful for development work.


EXAMPLES
  $ adapty plugins link myplugin
```

_See code: [@oclif/plugin-plugins](https://github.com/oclif/plugin-plugins/blob/v5.4.56/src/commands/plugins/link.ts)_

## `adapty plugins remove [PLUGIN]`

Removes a plugin from the CLI.

```
USAGE
  $ adapty plugins remove [PLUGIN...] [-h] [-v]

ARGUMENTS
  [PLUGIN...]  plugin to uninstall

FLAGS
  -h, --help     Show CLI help.
  -v, --verbose

DESCRIPTION
  Removes a plugin from the CLI.

ALIASES
  $ adapty plugins unlink
  $ adapty plugins remove

EXAMPLES
  $ adapty plugins remove myplugin
```

## `adapty plugins reset`

Remove all user-installed and linked plugins.

```
USAGE
  $ adapty plugins reset [--hard] [--reinstall]

FLAGS
  --hard       Delete node_modules and package manager related files in addition to uninstalling plugins.
  --reinstall  Reinstall all plugins after uninstalling.
```

_See code: [@oclif/plugin-plugins](https://github.com/oclif/plugin-plugins/blob/v5.4.56/src/commands/plugins/reset.ts)_

## `adapty plugins uninstall [PLUGIN]`

Removes a plugin from the CLI.

```
USAGE
  $ adapty plugins uninstall [PLUGIN...] [-h] [-v]

ARGUMENTS
  [PLUGIN...]  plugin to uninstall

FLAGS
  -h, --help     Show CLI help.
  -v, --verbose

DESCRIPTION
  Removes a plugin from the CLI.

ALIASES
  $ adapty plugins unlink
  $ adapty plugins remove

EXAMPLES
  $ adapty plugins uninstall myplugin
```

_See code: [@oclif/plugin-plugins](https://github.com/oclif/plugin-plugins/blob/v5.4.56/src/commands/plugins/uninstall.ts)_

## `adapty plugins unlink [PLUGIN]`

Removes a plugin from the CLI.

```
USAGE
  $ adapty plugins unlink [PLUGIN...] [-h] [-v]

ARGUMENTS
  [PLUGIN...]  plugin to uninstall

FLAGS
  -h, --help     Show CLI help.
  -v, --verbose

DESCRIPTION
  Removes a plugin from the CLI.

ALIASES
  $ adapty plugins unlink
  $ adapty plugins remove

EXAMPLES
  $ adapty plugins unlink myplugin
```

## `adapty plugins update`

Update installed plugins.

```
USAGE
  $ adapty plugins update [-h] [-v]

FLAGS
  -h, --help     Show CLI help.
  -v, --verbose

DESCRIPTION
  Update installed plugins.
```

_See code: [@oclif/plugin-plugins](https://github.com/oclif/plugin-plugins/blob/v5.4.56/src/commands/plugins/update.ts)_
<!-- commandsstop -->
