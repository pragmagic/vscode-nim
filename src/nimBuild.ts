/*---------------------------------------------------------
 * Copyright (C) Xored Software Inc. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------*/

'use strict';

import vscode = require('vscode');
import cp = require('child_process');
import path = require('path');
import os = require('os');
import fs = require('fs');
import { getNimExecPath, getProjectFile, getProjects, isProjectMode } from './nimUtils';

export interface ICheckResult {
    file: string;
    line: number;
    column: number;
    msg: string;
    severity: string;
}

let executors: { [project: string]: cp.ChildProcess; } = {};

function nimExec(project: string, command: string, args: string[], useStdErr: boolean, callback: (lines: string[]) => any) {
    return new Promise((resolve, reject) => {
        if (!getNimExecPath()) {
            return resolve([]);
        }
        var cwd = vscode.workspace.rootPath;

        if (executors[project]) {
            executors[project].kill('SIGKILL');
            executors[project] = null;
        }

        let executor = cp.spawn(getNimExecPath(), [command, ...args], { cwd: cwd });
        executors[project] = executor;
        executor.on('error', (err) => {
            if (err && (<any>err).code === 'ENOENT') {
                vscode.window.showInformationMessage('No \'nim\' binary could be found in PATH: \'' + process.env['PATH'] + '\'');
                return resolve([]);
            }
        });

        var out = '';
        executor.on('exit', (code, signal) => {
            executors[project] = null;
            if (signal === 'SIGKILL') {
                reject([]);
            } else {
                try {
                    var ret = callback(out.split(os.EOL));
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
    var templateError: boolean = false;
    var messageText = '';
    var lastFile = {file: null, column: null, line: null};
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
            let [_, file, lineStr, charStrRaw_, charStr, severityRaw, severity, msg] = match;
            if (msg === 'template/generic instantiation from here') {
                if (file.toLowerCase().startsWith(vscode.workspace.rootPath.toLowerCase())) {
                   lastFile = {file: file, column: charStr, line: lineStr};
                }
            } else {
                if (messageText !== '' && ret.length > 0) {
                    ret[ret.length - 1].msg += os.EOL + messageText;
                }
                messageText = '';
                if (file.toLowerCase().startsWith(vscode.workspace.rootPath.toLowerCase())) {
                    ret.push({ file: file, line: parseInt(lineStr), column: parseInt(charStr), msg: msg, severity });
                } else if (lastFile.file != null) {
                    ret.push({ file: lastFile.file, line: parseInt(lastFile.line), column: parseInt(lastFile.column), msg: msg, severity });
                }
                lastFile = {file: null, column: null, line: null};
            }
        }
    }
    if (messageText !== '' && ret.length > 0) {
        ret[ret.length - 1].msg += os.EOL + messageText;
    }

    return ret;
}

export function check(filename: string, nimConfig: vscode.WorkspaceConfiguration): Promise<ICheckResult[]> {
    var runningToolsPromises = [];
    var cwd = path.dirname(filename);

    if (!!nimConfig['lintOnSave']) {
        if (!isProjectMode()) {
            runningToolsPromises.push(nimExec(getProjectFile(filename), 'check', ['--listFullPaths', getProjectFile(filename)], true, parseErrors));
        } else {
            getProjects().forEach(project => {
                runningToolsPromises.push(nimExec(project, 'check', ['--listFullPaths', project], true, parseErrors));
            });
        }
    }

    return Promise.all(runningToolsPromises).then(resultSets => [].concat.apply([], resultSets));
}
