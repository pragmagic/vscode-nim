# Nim for Visual Studio Code

[![Build Status](https://travis-ci.org/pragmagic/vscode-nim.svg?branch=master)](https://travis-ci.org/pragmagic/vscode-nim)

This extension adds language support for the Nim language to VS Code, including:

- Colorization
- Code Completion
- Goto Definition
- Find References
- File outline
- Build-on-save

## Using

First, you will need to install Visual Studio Code `0.10`. 
In the command palette (`cmd-shift-p`) select `Install Extension` and choose `Nim`.  

The following tools are required for the extension:
* Nim compiler - http://nim-lang.org
* Nim package manager - https://github.com/nim-lang/nimble
* Nimsuggest - https://github.com/nim-lang/nimsuggest (can be installed later from the extension, You should see `Nimsuggest Tools Missing` in the bottom right, 
clicking this will offer to install `Nimsuggest` tool for the extension to support it's full feature set).

_Note_: It is recommended to turn `Auto Save` on in Visual Studio Code (`File -> Auto Save`) when using this extension.  

### Options

The following Visual Studio Code settings are available for the Nim extension.  These can be set in user preferences (`cmd+,`) or workspace settings (`.vscode/settings.json`).

```javascript
{
	"nim.buildOnSave": true,
	"nim.lintOnSave": true,
	"nim.project": "project.nim"
}
```

### Commands

In addition to integrated editing features, the extension also provides several commands in the Command Palette for working with Nim files:

* `Nim: Buld project` to build a project or opened file
* `Nim: Run project` to build and run a project or opened file

## TODO

* Syntax highlight for `nim.cfg`
* Rename support
* Documentation
* Quick info
* Workspace symbol search
* Code action for imports (suggest available modules to import)
* Debug support 
