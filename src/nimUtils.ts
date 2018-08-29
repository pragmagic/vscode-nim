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
import lstat = require('lstat');
import bluebird = require('bluebird');

import { showNimStatus, hideNimStatus } from './nimStatus';

let _pathesCache: { [tool: string]: string; } = {};
var _projects: string[] = [];

export async function getNimExecPath(): Promise<string> {
    let path = getBinPath('nim');
    if (!path) {
        vscode.window.showInformationMessage('No \'nim\' binary could be found in PATH environment variable');
        return Promise.reject()
    }
    return Promise.resolve(path);
}

/**
 * Returns full path to nimpretty executables or '' if file not found.
 */
export async function getNimPrettyExecPath(): Promise<string> {
    let toolname = 'nimpretty';
    if (!_pathesCache[toolname]) {
        let binPath = await getNimExecPath()
        let nimPrettyPath = path.resolve(binPath, correctBinname(toolname));
        if (fs.existsSync(nimPrettyPath)) {
            _pathesCache[toolname] = nimPrettyPath;
        } else {
            _pathesCache[toolname] = '';
        }
    }
    return _pathesCache[toolname];
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

/**
 * Returns temporary file path of edited document.
 */
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

export async function promiseSymbolLink(path: string): Promise<string>{
    return lstat(path).then(stat => {
        if (stat.isSymbolicLink()){
            return Promise.resolve(path)
        }else{
            return Promise.reject("");
        }
      });
}

export async function getBinPath(tool: string): Promise<string> {
    if (_pathesCache[tool]) return Promise.resolve(_pathesCache[tool]);
    if (process.env['PATH']) {
        var pathparts = (<string>process.env.PATH).split((<any>path).delimiter);
        let pathes = pathparts.map(dir => path.join(dir, correctBinname(tool)))
        let promises = pathes.map(x => promiseSymbolLink(x))
        let anyLink = await bluebird.any(promises);
        if (anyLink){
            _pathesCache[tool] = anyLink;
        }
        if (process.platform !== 'win32') {
            try {
                let nimPath;
                if (process.platform === 'darwin') {
                    nimPath = cp.execFileSync('readlink', [_pathesCache[tool]]).toString().trim();
                    if (nimPath.length > 0 && !path.isAbsolute(nimPath)) {
                        nimPath = path.normalize(path.join(path.dirname(_pathesCache[tool]), nimPath));
                    }
                } else if (process.platform === 'linux') {
                    nimPath = cp.execFileSync('readlink', ['-f', _pathesCache[tool]]).toString().trim();
                } else {
                    nimPath = cp.execFileSync('readlink', [_pathesCache[tool]]).toString().trim();
                }

                if (nimPath.length > 0) {
                    _pathesCache[tool] = nimPath;
                }
            } catch (e) {
                console.error(e);
                return Promise.reject()
                // ignore exception
            }
        }
    }
    return Promise.resolve(_pathesCache[tool]);
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