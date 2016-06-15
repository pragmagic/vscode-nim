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
var _projects: string[] = []; 

export function getNimExecPath(): string {
    let path = getBinPath('nim');
    if (!path) {
        vscode.window.showInformationMessage("No 'nim' binary could be found in PATH environment variable");
    }
    return path;
}

export function initNimSuggest(ctx: vscode.ExtensionContext) {
    prepareConfig();
    vscode.workspace.onDidChangeConfiguration(prepareConfig);
    let extensionPath = ctx.extensionPath
    var nimSuggestDir = path.resolve(extensionPath, "nimsuggest");
    var nimSuggestSourceFile = path.resolve(nimSuggestDir, "nimsuggest.nim");
    var execFile = path.resolve(nimSuggestDir, correctBinname("nimsuggest"));
    var nimExecTimestamp = fs.statSync(getNimExecPath()).mtime.getTime()
    var nimSuggestTimestamp = fs.statSync(nimSuggestSourceFile).mtime.getTime()

    if (fs.existsSync(execFile) && ctx.globalState.get('nimExecTimestamp', 0) == nimExecTimestamp && 
        ctx.globalState.get('nimSuggestTimestamp', 0) == nimSuggestTimestamp) {
        _nimSuggestPath = execFile; 
    } else {
        let nimCacheDir = path.resolve(nimSuggestDir, "nimcache");
        if (fs.existsSync(nimCacheDir)) {
            removeDirSync(nimCacheDir);
        }
        let cmd = '"' + getNimExecPath()  + '" c -d:release --path:"' + path.dirname(path.dirname(getNimExecPath())) + '" nimsuggest.nim';
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
            ctx.globalState.update('nimSuggestTimestamp', nimSuggestTimestamp); 
        });
    }
}

export function getNimSuggestPath(): string {
    return _nimSuggestPath;
}

export function getProjectFile(filename: string) {
    if (filename && !path.isAbsolute(filename)) {
        filename = path.relative(vscode.workspace.rootPath, filename)
    }
    if (!isProjectMode()) {
        return filename;
    }
    for (var i = 0; i < _projects.length; i++) {
        let project = _projects[i];
        if (filename.startsWith(path.dirname(project))) {
            return project;
        }
    }
    return _projects[0];
}

export function getDirtyFile(document: vscode.TextDocument): string {
    var dirtyFilePath = path.normalize(path.join(os.tmpdir(), "vscode-nim-dirty.nim"));
    fs.writeFileSync(dirtyFilePath, document.getText());
    return dirtyFilePath;
}

export function isProjectMode(): boolean {
    return _projects.length > 0;
}

export function getProjects(): string[] {
    return _projects;
}

function prepareConfig(): void {
    let config = vscode.workspace.getConfiguration('nim');
    let projects = config["project"]; 
    _projects = [];
    if (projects) {
      if (projects instanceof Array) {
          projects.forEach((project) => {
              _projects.push(path.isAbsolute(project) ? project : path.resolve(vscode.workspace.rootPath, project));
          });
      } else {
          _projects.push(path.isAbsolute(projects) ? projects : path.resolve(vscode.workspace.rootPath, projects));
      }
    }
}

function getBinPath(tool: string): string {
    if (_pathesCache[tool]) return _pathesCache[tool];
    if (process.env["PATH"]) {
        var pathparts = (<string>process.env.PATH).split((<any>path).delimiter);
        _pathesCache[tool] = pathparts.map(dir => path.join(dir, correctBinname(tool))).filter(candidate => fs.existsSync(candidate))[0];
        if (process.platform !== 'win32') {
            let args = process.platform === 'linux' ? ['-f', _pathesCache[tool]] : [_pathesCache[tool]]
            try { 
                let buff = cp.execFileSync("readlink", args)
                if (buff.length > 0) {
                    _pathesCache[tool] = buff.toString().trim()
                }
            } catch(e) {
                // ignore exception
            } 
        }
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

function removeDirSync(p: string): void {
    if (fs.existsSync(p)) {
        fs.readdirSync(p).forEach((file, index) => {
            var curPath = path.resolve(p, file);
            if (fs.lstatSync(curPath).isDirectory()) {
                removeDirSync(curPath);
            } else {
                fs.unlinkSync(curPath);
            }
        });
        fs.rmdirSync(p);
    }
};