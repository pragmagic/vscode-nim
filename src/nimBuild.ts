/*---------------------------------------------------------
 * Copyright (C) Xored Software Inc. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------*/

'use strict';

import vscode = require('vscode');
import cp = require('child_process');
import os = require('os');
import { isWorkspaceFile, getNimExecPath, getProjectFileInfo, getProjects, isProjectMode, ProjectFileInfo, toLocalFile } from './nimUtils';
import { execNimSuggest, NimSuggestType, NimSuggestResult } from './nimSuggestExec';

export interface ICheckResult {
    file: string;
    line: number;
    column: number;
    msg: string;
    severity: string;
}

let executors: { [project: string]: { initialized: boolean, process?: cp.ChildProcess } } = {};

function nimExec(project: ProjectFileInfo, command: string, args: string[], useStdErr: boolean, callback: (lines: string[]) => any) {
    return new Promise((resolve, reject) => {
        if (!getNimExecPath()) {
            return resolve([]);
        }
        let projectPath = toLocalFile(project);
        if (executors[projectPath] && executors[projectPath].initialized) {
            let ps = executors[projectPath].process;
            executors[projectPath] = { initialized: false, process: undefined };
            if (ps) {
                ps.kill('SIGKILL');
            }
        } else {
            executors[projectPath] = { initialized: false, process: undefined };
        }
        let executor = cp.spawn(getNimExecPath(), [command, ...args], { cwd: project.wsFolder.uri.fsPath });
        executors[projectPath].process = executor;
        executors[projectPath].initialized = true;
        executor.on('error', (err) => {
            if (err && (<any>err).code === 'ENOENT') {
                vscode.window.showInformationMessage('No \'nim\' binary could be found in PATH: \'' + process.env['PATH'] + '\'');
                return resolve([]);
            }
        });

        var out = '';
        executor.on('exit', (code, signal) => {
            if (signal === 'SIGKILL') {
                reject([]);
            } else {
                executors[projectPath] = { initialized: false, process: undefined };
                try {
                    let split = out.split(os.EOL);
                    if (split.length === 1) {
                        var lfSplit = split[0].split('\n');
                        if (lfSplit.length > split.length)
                            split = lfSplit;
                    }

                    var ret = callback(split);
                    resolve(ret);
                } catch (e) {
                    reject(e);
                }
            }
        });

        if (useStdErr) {
            executor.stderr.on('data', (data) => {
                out += data.toString();
            });
        } else {
            executor.stdout.on('data', (data) => {
                out += data.toString();
            });
        }
    });
}

function parseErrors(lines: string[]): ICheckResult[] {
    var ret: ICheckResult[] = [];
    var messageText = '';
    var lastFile = { file: '', column: '', line: '' };
    for (var i = 0; i < lines.length; i++) {
        let line = lines[i].trim();
        if (line.startsWith('Hint:')) {
            continue;
        }
        let match = /^([^(]*)?\((\d+)(,\s(\d+))?\)( (\w+):)? (.*)/.exec(line);
        if (!match) {
            if (messageText.length < 1024) {
                messageText += os.EOL + line;
            }
        } else {
            let [, file, lineStr, , charStr, , severity, msg] = match;
            if (msg === 'template/generic instantiation from here') {
                if (isWorkspaceFile(file)) {
                    lastFile = { file: file, column: charStr, line: lineStr };
                }
            } else {
                if (messageText !== '' && ret.length > 0) {
                    ret[ret.length - 1].msg += os.EOL + messageText;
                }
                messageText = '';
                if (isWorkspaceFile(file)) {
                    ret.push({ file: file, line: parseInt(lineStr), column: parseInt(charStr), msg: msg, severity });
                } else if (lastFile.file !== '') {
                    ret.push({ file: lastFile.file, line: parseInt(lastFile.line), column: parseInt(lastFile.column), msg: msg, severity });
                }
                lastFile = { file: '', column: '', line: '' };
            }
        }
    }
    if (messageText !== '' && ret.length > 0) {
        ret[ret.length - 1].msg += os.EOL + messageText;
    }

    return ret;
}

function parseNimsuggestErrors(items: NimSuggestResult[]): ICheckResult[] {
    var ret: ICheckResult[] = [];
    for (var i = 0; i < items.length; i++) {
        let item = items[i];
        if (item.path === '???' && item.type === 'Hint') {
            continue;
        }
        ret.push({ file: item.path, line: item.line, column: item.column, msg: item.documentation, severity: item.type });
    }
    return ret;
}

export function check(filename: string, nimConfig: vscode.WorkspaceConfiguration): Promise<ICheckResult[]> {
    var runningToolsPromises: Promise<any>[] = [];

    if (!!nimConfig['useNimsuggestCheck']) {
        runningToolsPromises.push(new Promise((resolve, reject) => {
            execNimSuggest(NimSuggestType.chk, filename, 0, 0, '').then(items => {
                if (items && items.length > 0) {
                    resolve(parseNimsuggestErrors(items));
                } else {
                    resolve([]);
                }
            }).catch(reason => reject(reason));
        }));
    } else {
        if (!isProjectMode()) {
            let project = getProjectFileInfo(filename);
            runningToolsPromises.push(nimExec(project, 'check', ['--threads:on', '--listFullPaths', project.filePath], true, parseErrors));
        } else {
            getProjects().forEach(project => {
                runningToolsPromises.push(nimExec(project, 'check', ['--threads:on', '--listFullPaths', project.filePath], true, parseErrors));
            });
        }
    }

    return Promise.all(runningToolsPromises).then(resultSets => [].concat.apply([], resultSets));
}
