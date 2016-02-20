/*---------------------------------------------------------
 * Copyright (C) Xored Software Inc. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------*/

'use strict';

import fs = require('fs');
import path = require('path');
import os = require('os');
import cp = require('child_process');
import vscode = require('vscode');
import { showNimStatus } from './nimStatus'

let pathesCache: { [tool: string]: string; } = {};
var isNimSuggestInstalled = undefined;

export function correctBinname(binname: string) {
    if (process.platform === 'win32') {
        return binname + ".exe";
    } else {
        return binname;
    }
}

export function getNimExecPath(): string {
    let path = getBinPath('nim');
    if (!path) {
        vscode.window.showInformationMessage("No 'nim' binary could be found in PATH environment variable");
    }
    return path;
}

export function getNimbleExecPath(): string {
    let path = getBinPath('nimble');
    if (!path) {
        vscode.window.showInformationMessage("Package manager 'nimble' not found.",
            {
                title: 'Open Project Site',
                command() {
                    var command = 'open';
                    switch (process.platform) {
                        case 'darwin':
                            command = 'open';
                            break;
                        case 'win32':
                            command = 'explorer.exe';
                            break;
                        case 'linux':
                            command = 'xdg-open';
                            break;
                    }

                    cp.spawn(command, ['https://github.com/nim-lang/nimble']);
                }
            }).then(selection => {
                if (selection) {
                    selection.command();
                }
            });
    }
    return path;
}

export function getNimSuggestExecPath(force?: boolean): string {
    if (!isNimSuggestInstalled && !(isNimSuggestInstalled == undefined) && !force) {
        return null;
    }
    let tool = 'nimsuggest';
    let nimSuggestPath = getBinPath(tool);
    if (!nimSuggestPath && (isNimSuggestInstalled == undefined || force)) {
        var nimble = getNimbleExecPath();
        try {
            var output = cp.execFileSync(nimble, ['path', tool]).toString();
            let newPath = path.resolve(output.trim(), correctBinname(tool));
            if (fs.existsSync(newPath)) {
                pathesCache[tool] = newPath;
                isNimSuggestInstalled = true;
                return newPath;
            }
        } catch (e) {
            isNimSuggestInstalled = false;
        }
    }
    return nimSuggestPath;
}

export function getProjectFile(filename?: string) {
    let config = vscode.workspace.getConfiguration("nim");
    if (filename) {
        filename = vscode.workspace.asRelativePath(filename);

        if (filename.startsWith(path.sep)) {
            filename = filename.slice(1);
        }
    }
    return config["project"] || filename || "";
}

export function getDirtyFile(document: vscode.TextDocument): string {
    var dirtyFilePath = path.normalize(path.join(os.tmpdir(), "vscode-nim-dirty.nim"));
    fs.writeFileSync(dirtyFilePath, document.getText());
    return dirtyFilePath;
}

function getBinPath(tool: string): string {
    if (pathesCache[tool]) return pathesCache[tool];
    if (process.env["PATH"]) {
        var pathparts = (<string>process.env.PATH).split((<any>path).delimiter);
        pathesCache[tool] = pathparts.map(dir => path.join(dir, correctBinname(tool))).filter(candidate => fs.existsSync(candidate))[0];
    }
    return pathesCache[tool];
}