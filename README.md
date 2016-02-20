# Nim for Visual Studio Code

[![Build Status](https://travis-ci.org/pragmagic/vscode-nim.svg?branch=master)](https://travis-ci.org/pragmagic/vscode-nim)

This extension adds language support for the Nim language to VS Code, including:

- Syntax Highlight (nim, nimble, nim.cfg)
- Code Completion
- Goto Definition
- Find References
- File outline
- Build-on-save
- Workspace symbol search


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
	"nim.buildOnSave": false,
    "nim.buildCommand": "c",
	"nim.lintOnSave": true,
	"nim.project": "project.nim",
    "nim.licenseString": "# Copyright 2016.\n\n"
}
```

### Commands

In addition to integrated editing features, the extension also provides several commands in the Command Palette for working with Nim files:

* `Nim: Buld project` to build a project or opened file
* `Nim: Run project` to build and run a project or opened file

## TODO

* Rename support
* Documentation
* Quick info
* Code action for imports (suggest available modules to import)
* Debug support 

## History

### 0.4.4
* Fixed #7 - Block comments / inline comments are not supported
* Fixed #8 - Terrible experience with clean install w/o nimsuggest

### 0.4.3
* Added workspace symbol search support 
* Rewrote nimsuggest handling to use TCP mode
* Added `nim.licenseString` for inserting default header in new nim files
* Updated `run project` command to run single file in non project mode 