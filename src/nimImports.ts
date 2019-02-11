/*---------------------------------------------------------
 * Copyright (C) Xored Software Inc. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------*/

'use strict';

import vscode = require('vscode');
import cp = require('child_process');
import fs = require('fs');
import path = require('path');
import { getNimExecPath, getProjects, isProjectMode, getNimbleExecPath } from './nimUtils';

class NimbleModuleInfo {
    name!: string;
    author?: string;
    description?: string;
    version?: string;
}

class NimModuleInfo {
    name!: string;
    fullName!: string;
    path!: string;
}

var nimbleModules: NimbleModuleInfo[] = [];
var nimModules: { [project: string]: NimModuleInfo[] } = {};

function getNimDirectories(projectDir: string, projectFile: string): Promise<string[]> {
    return new Promise<string[]>((resolve, reject) => {
        cp.exec(getNimExecPath() + ' dump ' + projectFile, { cwd: projectDir },
            (error, stdout: string, stderr: string) => {
                var res: string[] = [];
                let parts = stderr.split('\n');
                for (const part of parts) {
                    let p = part.trim();
                    if (p.indexOf('Hint: ') !== 0 && p.length > 0) {
                        res.push(p);
                    }
                }
                resolve(res);
            }
        );
    });
}

function createNimModule(projectDir: string, rootDir: string, dir: string, file: string): NimModuleInfo {
    let fullPath = path.join(dir, file);
    var nimModule = new NimModuleInfo();
    nimModule.name = file.substr(0, file.length - 4);
    if (dir.length > rootDir.length) {
        let moduleDir = dir.substr(rootDir.length + 1).replace(path.sep, '.');
        nimModule.fullName = moduleDir + '.' + nimModule.name;
    } else {
        nimModule.fullName = nimModule.name;
    }
    nimModule.path = fullPath;
    return nimModule;
}

function walkDir(projectDir: string, rootDir: string, dir: string, singlePass: boolean) {
    fs.readdir(dir, (err, files) => {
        if (files) {
            for (const file of files) {
                let fullPath = path.join(dir, file);
                if (fs.statSync(fullPath).isDirectory()) {
                    if (!singlePass) {
                        walkDir(projectDir, rootDir, fullPath, false);
                    }
                } else if (file.toLowerCase().endsWith('.nim')) {
                    nimModules[projectDir].push(createNimModule(projectDir, rootDir, dir, file));
                }
            }
        }
    });
}

async function initNimDirectories(projectDir: string, projectFile: string) {
    if (!nimModules[projectDir]) {
        nimModules[projectDir] = [];
        let nimDirectories = await getNimDirectories(projectDir, projectFile);
        let nimRoot = path.dirname(path.dirname(getNimExecPath()));
        for (const dirPath of nimDirectories) {
            walkDir(projectDir, dirPath, dirPath, dirPath.startsWith(nimRoot));
        }
    }
}

function getNimbleModules(rootDir: string): Promise<string[]> {
    return new Promise<string[]>((resolve, reject) => {
        cp.exec(getNimbleExecPath() + ' list -i', { cwd: rootDir },
            (error, stdout: string, stderr: string) => {
                var res: string[] = [];
                let parts = stdout.split('\n');
                for (const part of parts) {
                    let p = part.split('[')[0].trim();
                    if (p.length > 0 && p !== 'compiler') {
                        res.push(p);
                    }
                }
                resolve(res);
            }
        );
    });
}

async function initNimbleModules(rootDir: string) {
    let nimbleModuleNames = await getNimbleModules(rootDir);
    for (const moduleName of nimbleModuleNames) {
        try {
            let out = cp.execSync(getNimbleExecPath() + ' --y dump ' + moduleName, { cwd: rootDir }).toString();
            var nimbleModule = new NimbleModuleInfo();
            nimbleModule.name = moduleName;
            for (const line of out.split(/\n/)) {
                let pairs = line.trim().split(': "');
                if (pairs.length === 2) {
                    let value = pairs[1].substring(0, pairs[1].length - 1);
                    if (pairs[0] === 'author') {
                        nimbleModule.author = value;
                    } else if (pairs[0] === 'version') {
                        nimbleModule.version = value;
                    } else if (pairs[0] === 'desc') {
                        nimbleModule.description = value;
                    }
                }
            }
            nimbleModules.push(nimbleModule);
        } catch {
            console.log('Module incorrect ' + moduleName);
        }
    }
}

export function getImports(prefix: string | undefined, projectDir: string): vscode.CompletionItem[] {
    var suggestions: vscode.CompletionItem[] = [];
    for (const nimbleModule of nimbleModules) {
        if (!prefix || nimbleModule.name.startsWith(prefix)) {
            var suggestion = new vscode.CompletionItem(nimbleModule.name);
            suggestion.kind = vscode.CompletionItemKind.Module;
            if (nimbleModule.version) {
                suggestion.detail = nimbleModule.name + ' [' + nimbleModule.version + ']';
            } else {
                suggestion.detail = nimbleModule.name;
            }
            suggestion.detail += ' (Nimble)';
            var doc = '**Name**: ' + nimbleModule.name;
            if (nimbleModule.version) {
                doc += '\n\n**Version**: ' + nimbleModule.version;
            }
            if (nimbleModule.author) {
                doc += '\n\n**Author**: ' + nimbleModule.author;
            }
            if (nimbleModule.description) {
                doc += '\n\n**Description**: ' + nimbleModule.description;
            }
            suggestion.documentation = new vscode.MarkdownString(doc);
            suggestions.push(suggestion);
        }
        if (suggestions.length >= 20) {
            return suggestions;
        }
    }
    if (nimModules[projectDir]) {
        for (const nimModule of nimModules[projectDir]) {
            if (!prefix || nimModule.name.startsWith(prefix)) {
                var suggest = new vscode.CompletionItem(nimModule.name);
                suggest.kind = vscode.CompletionItemKind.Module;
                suggest.insertText = nimModule.fullName;
                suggest.detail = nimModule.fullName;
                suggest.documentation = nimModule.path;
                suggestions.push(suggest);
            }
            if (suggestions.length >= 100) {
                return suggestions;
            }
        }
    }
    return suggestions;
}

export async function initImports() {
    if (vscode.workspace.workspaceFolders) {
        await await initNimbleModules(vscode.workspace.workspaceFolders[0].uri.fsPath);
    }

    if (isProjectMode()) {
        for (const project of getProjects()) {
            await initNimDirectories(project.wsFolder.uri.fsPath, project.filePath);
        }
    } else {
        if (vscode.workspace.workspaceFolders) {
            await initNimDirectories(vscode.workspace.workspaceFolders[0].uri.fsPath, '');
        }
    }
}

export async function addFileToImports(file: string) {
    if (isProjectMode()) {
        for (const project of getProjects()) {
            let projectDir = project.wsFolder.uri.fsPath;
            if (file.startsWith(projectDir)) {
                if (!nimModules[projectDir]) {
                    nimModules[projectDir] = [];
                }
                nimModules[projectDir].push(createNimModule(projectDir, projectDir, path.dirname(file), path.basename(file)));
            }
        }
    } else {
        if (vscode.workspace.workspaceFolders) {
            let projectDir = vscode.workspace.workspaceFolders[0].uri.fsPath;
            if (!nimModules[projectDir]) {
                nimModules[projectDir] = [];
            }
            nimModules[projectDir].push(createNimModule(projectDir, projectDir, path.dirname(file), path.basename(file)));
        }
    }
}

export async function removeFileFromImports(file: string) {
    for (const key in nimModules) {
        const items = nimModules[key];
        var i = 0;
        while (i < items.length) {
            if (items[i].path === file) {
                items.splice(i);
            } else {
                i++;
            }
        }
    }
}