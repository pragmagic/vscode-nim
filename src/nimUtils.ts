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
const mkdirp = require('mkdirp');

export interface ProjectFileInfo {
    wsFolder: vscode.WorkspaceFolder;
    filePath: string;
}

export interface ProjectMappingInfo {
    fileRegex: RegExp;
    projectPath: string;
}

let _pathesCache: { [tool: string]: string; } = {};
var _projects: ProjectFileInfo[] = [];
var _projectMapping: ProjectMappingInfo[] = [];

export function getNimExecPath(executable: string = 'nim'): string {
    let path = getBinPath(executable);
    if (!path) {
        vscode.window.showInformationMessage(`No \'${executable}\' binary could be found in PATH environment variable`);
    }
    return path;
}

/**
 * Returns true if path related to any workspace folders,
 *
 * @param filePath absolute file path
 */
export function isWorkspaceFile(filePath: string): boolean {
    if (vscode.workspace.workspaceFolders) {
        for (const wsFolder of vscode.workspace.workspaceFolders) {
            if (wsFolder.uri.scheme === 'file' &&
                filePath.toLowerCase().startsWith(wsFolder.uri.fsPath.toLowerCase())) {
                return true;
            }
        }
    }
    return false;
}

/**
 * Return project info from file path.
 *
 * @param filePath relative or absolite file path
 */
export function toProjectInfo(filePath: string): ProjectFileInfo {
    if (path.isAbsolute(filePath)) {
        let workspaceFolder = vscode.workspace.getWorkspaceFolder(vscode.Uri.file(filePath));
        if (workspaceFolder) {
            return { wsFolder: workspaceFolder, filePath: vscode.workspace.asRelativePath(filePath, false) };
        }
    } else {
        if (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0) {
            if (vscode.workspace.workspaceFolders.length === 1) {
                return { wsFolder: vscode.workspace.workspaceFolders[0], filePath: filePath };
            } else {
                let parsedPath = filePath.split('/');
                if (parsedPath.length > 1) {
                    for (const folder of vscode.workspace.workspaceFolders) {
                        if (parsedPath[0] === folder.name) {
                            return { wsFolder: folder, filePath: filePath.substr(parsedPath[0].length + 1) };
                        }
                    }
                }
            }
        }
    }
    let parsedPath = path.parse(filePath);
    return {
        wsFolder: {
            uri: vscode.Uri.file(parsedPath.dir),
            name: 'root',
            index: 0
        },
        filePath: parsedPath.base
    };
}

/**
 * Return project file in filesystem.
 *
 * @param project project file info
 */
export function toLocalFile(project: ProjectFileInfo): string {
    return project.wsFolder.uri.with({path: project.wsFolder.uri.path + '/' + project.filePath}).fsPath;
}

/**
 * Returns full path to nimpretty executables or '' if file not found.
 */
export function getNimPrettyExecPath(): string {
    let toolname = 'nimpretty';
    if (!_pathesCache[toolname]) {
        let nimPrettyPath = path.resolve(getBinPath(toolname));
        if (fs.existsSync(nimPrettyPath)) {
            _pathesCache[toolname] = nimPrettyPath;
        } else {
            _pathesCache[toolname] = '';
        }
    }
    return _pathesCache[toolname];
}

/**
 * Returns full path to nimble executables or '' if file not found.
 */
export function getNimbleExecPath(): string {
    let toolname = 'nimble';
    if (!_pathesCache[toolname]) {
        let nimblePath = path.resolve(getBinPath(toolname));
        if (fs.existsSync(nimblePath)) {
            _pathesCache[toolname] = nimblePath;
        } else {
            _pathesCache[toolname] = '';
        }
    }
    return _pathesCache[toolname];
}

export function getProjectFileInfo(filename: string): ProjectFileInfo {
    if (!isProjectMode()) {
        if (_projectMapping.length > 0) {
            var projectInfo: ProjectFileInfo | undefined;
            let uriPath = vscode.Uri.file(filename).path;
            _projectMapping.forEach(mapping => {
                if (mapping.fileRegex.test(uriPath)) {
                    projectInfo = toProjectInfo(uriPath.replace(mapping.fileRegex, mapping.projectPath));
                    return;
                }
            });
            if (!projectInfo) {
                projectInfo = toProjectInfo(filename);
            }
            return projectInfo;
        } else {
            return toProjectInfo(filename);
        }
    }
    for (const project of _projects) {
        if (filename.startsWith(path.dirname(toLocalFile(project)))) {
            return project;
        }
    }
    return _projects[0];
}

declare global {
   interface String {
     hashCode(): number;
   }
 }

/* fast string hash from https://werxltd.com/wp/2010/05/13/javascript-implementation-of-javas-string-hashcode-method/ */
String.prototype.hashCode = function () {
    var hash = 0, i, chr;
    for (i = 0; i < this.length; i++) {
        chr   = this.charCodeAt(i);
        hash  = ((hash << 5) - hash) + chr;
        hash |= 0; // Convert to 32bit integer
    }
    return Math.abs(hash);
};

/**
 * Returns temporary file path of edited document.
 */
export function getDirtyFile(document: vscode.TextDocument): string {
    let projectInfo = getProjectFileInfo(document.fileName);
    let projectFilePath = document.fileName.substring(projectInfo.wsFolder.uri.path.length);
    let uniqueStringHash = projectInfo.wsFolder.uri.path.hashCode();
    let dirtyFilePath = path.normalize(path.join(os.tmpdir(), projectInfo.wsFolder.name + '-' + uniqueStringHash.toString(), projectFilePath));
    if (fs.existsSync(dirtyFilePath) === false) {
        mkdirp.sync(path.dirname(dirtyFilePath));
    }
    fs.writeFileSync(dirtyFilePath, document.getText());

    return dirtyFilePath;
}

export function isProjectMode(): boolean {
    return _projects.length > 0;
}

export function getProjects(): ProjectFileInfo[] {
    return _projects;
}

export function prepareConfig(): void {
    let config = vscode.workspace.getConfiguration('nim');
    let projects = config['project'];
    _projects = [];
    if (projects) {
        if (projects instanceof Array) {
            projects.forEach((project) => {
                _projects.push(toProjectInfo(project));
            });
        } else {
            vscode.workspace.findFiles(projects).then(result => {
                if (result && result.length > 0) {
                    _projects.push(toProjectInfo(result[0].fsPath));
                }
            });
        }
    }
    let projectMapping = config['projectMapping'];
    _projectMapping = [];
    if (projectMapping) {
        if (projectMapping instanceof Object) {
            for (const key in projectMapping) {
                if (projectMapping.hasOwnProperty(key)) {
                    const path = <string> projectMapping[key];
                    _projectMapping.push({ fileRegex: new RegExp(key), projectPath: path });
                }
            }
        }
    }
}

export function getBinPath(tool: string): string {
    if (_pathesCache[tool]) return _pathesCache[tool];
    if (process.env['PATH']) {
        // add support for choosenim
        process.env['PATH'] = process.env['PATH'] + (<any>path).delimiter + process.env['HOME'] + '/.nimble/bin';
        if (process.platform === 'win32') {
            process.env['PATH'] = process.env['PATH'] + (<any>path).delimiter + process.env['USERPROFILE'] + '/.nimble/bin';
        }
        var pathparts = (<string>process.env.PATH).split((<any>path).delimiter);
        const endings = process.platform === 'win32' ? ['.exe', '.cmd', ''] : [''];
        _pathesCache[tool] = pathparts
            .map(dir => endings.map(ending => path.join(dir, tool + ending)))
            // Flatten array of ['path/to/candidate.exe', 'path/to/candidate.cmd']
            .reduce((acc, x) => acc.concat(x, []))
            .filter(candidate => fs.existsSync(candidate))[0];
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
}


let _channel: vscode.OutputChannel;
export function getOutputChannel() {
    if (!_channel) {
        _channel = vscode.window.createOutputChannel('Nim');
    }
    return _channel;
}
function padStart(len: number, input: string): string {
    let out = '';
    for (let i = input.length; i < len; i++) {
        out += '0';
    }
    return out + input;
}
function cleanDateString(date: Date): string {
    let year = date.getFullYear();
    let month = padStart(2, date.getMonth().toString());
    let dd = padStart(2, date.getDate().toString());
    let hour = padStart(2, date.getHours().toString());
    let minute = padStart(2, date.getMinutes().toString());
    let second = padStart(2, date.getSeconds().toString());
    let millisecond = padStart(3, date.getMilliseconds().toString());
    return `${year}-${month}-${dd} ${hour}:${minute}:${second}.${millisecond}`;
}

/**
 * Prints message in Nim's output channel
 */
export function outputLine(message: string) {
    let channel = getOutputChannel();
    let timeNow = new Date();
    channel.appendLine(`${cleanDateString(timeNow)} - ${message}`);
}
