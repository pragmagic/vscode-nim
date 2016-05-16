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
import { showNimStatus, hideNimStatus } from './nimStatus'

let _pathesCache: { [tool: string]: string; } = {};
var _nimSuggestPath: string = undefined;

export function getNimExecPath(): string {
    let path = getBinPath('nim');
    if (!path) {
        vscode.window.showInformationMessage("No 'nim' binary could be found in PATH environment variable");
    }
    return path;
}

export function initNimSuggest(ctx: vscode.ExtensionContext) {
    let extensionPath = ctx.extensionPath
    var nimSuggestDir = path.resolve(extensionPath, "nimsuggest");
    var execFile = path.resolve(nimSuggestDir, correctBinname("nimsuggest"));
    var nimExecTimestamp = fs.statSync(getNimExecPath()).mtime.getTime()

    if (fs.existsSync(execFile) && ctx.globalState.get('nimExecTimestamp', 0) == nimExecTimestamp) {
        _nimSuggestPath = execFile; 
    } else {
        let cmd = '"' + getNimExecPath()  + '" c -d:release --noNimblePath --path:"' + path.dirname(path.dirname(getNimExecPath())) + '" nimsuggest.nim';
        showNimStatus('Compiling nimsuggest', '');
        cp.exec(cmd, { cwd: nimSuggestDir }, (error, stdout, stderr) => {
            hideNimStatus();

            if (error) {
                vscode.window.showWarningMessage("Cannot compile nimsuggest. See console log for details");
                console.log(error);
                return;
            }
            if (stderr && stderr.length > 0) {
                console.error(stderr);
            }
            _nimSuggestPath = execFile;
            ctx.globalState.update('nimExecTimestamp', nimExecTimestamp); 
        });
    }
}

export function getNimSuggestPath(): string {
    return _nimSuggestPath;
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
    if (_pathesCache[tool]) return _pathesCache[tool];
    if (process.env["PATH"]) {
        var pathparts = (<string>process.env.PATH).split((<any>path).delimiter);
        _pathesCache[tool] = pathparts.map(dir => path.join(dir, correctBinname(tool))).filter(candidate => fs.existsSync(candidate))[0];
    }
    return _pathesCache[tool];
}

function correctBinname(binname: string): string {
    if (process.platform === 'win32') {
        return binname + ".exe";
    } else {
        return binname;
    }
}
