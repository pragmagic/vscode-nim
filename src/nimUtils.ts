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
import { showNimStatus, hideNimStatus } from './nimStatus';

let _pathesCache: { [tool: string]: string; } = {};
var _projects: string[] = [];

export function getNimExecPath(): string {
    let path = getBinPath('nim');
    if (!path) {
        vscode.window.showInformationMessage('No \'nim\' binary could be found in PATH environment variable');
    }
    return path;
}

export function getProjectFile(filename: string) {
    if (filename && !path.isAbsolute(filename)) {
        filename = path.relative(vscode.workspace.rootPath, filename);
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
    var dirtyFilePath = path.normalize(path.join(os.tmpdir(), 'vscodenimdirty.nim'));
    fs.writeFileSync(dirtyFilePath, document.getText());
    return dirtyFilePath;
}

export function isProjectMode(): boolean {
    return _projects.length > 0;
}

export function getProjects(): string[] {
    return _projects;
}

export function prepareConfig(): void {
    let config = vscode.workspace.getConfiguration('nim');
    let projects = config['project'];
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

export function getBinPath(tool: string): string {
    if (_pathesCache[tool]) return _pathesCache[tool];
    if (process.env['PATH']) {
        var pathparts = (<string>process.env.PATH).split((<any>path).delimiter);
        _pathesCache[tool] = pathparts.map(dir => path.join(dir, correctBinname(tool))).filter(candidate => fs.existsSync(candidate))[0];
        if (process.platform !== 'win32') {
            let args = process.platform === 'linux' ? ['-f', _pathesCache[tool]] : [_pathesCache[tool]];
            try {
                let buff = cp.execFileSync('readlink', args);
                if (buff.length > 0) {
                    _pathesCache[tool] = buff.toString().trim();
                }
            } catch (e) {
                // ignore exception
            }
        }
    }
    return _pathesCache[tool];
}

export function correctBinname(binname: string): string {
    if (process.platform === 'win32') {
        return binname + '.exe';
    } else {
        return binname;
    }
}

export function removeDirSync(p: string): void {
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