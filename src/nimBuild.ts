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
import { getNimExecPath, getProjectFile } from './nimUtils'
import { getNormalizedWorkspacePath } from './nimIndexer';
import { execNimSuggest, INimSuggestResult, NimSuggestType } from './nimSuggestExec'

export interface ICheckResult {
    file: string;
    line: number;
    column: number;
    msg: string;
    severity: string;
}

function nimExec(command: string, args: string[], useStdErr: boolean, printToOutput: boolean, callback: (string) => any) {
    return new Promise((resolve, reject) => {
        if (!getNimExecPath()) {
            return resolve([]);
        }
        var cwd = vscode.workspace.rootPath;
        cp.execFile(getNimExecPath(), [command, ...args], { cwd: cwd }, (err, stdout, stderr) => {
            try {
                if (err && (<any>err).code == "ENOENT") {
                    vscode.window.showInformationMessage("No 'nim' binary could be found in PATH: '" + process.env["PATH"] + "'");
                    return resolve([]);
                }
                var out = (useStdErr ? stderr : stdout).toString();
                var ret = callback(out.split(os.EOL));
                if (err && printToOutput) {
                    var outputWindow = vscode.window.createOutputChannel("Nim Output");
                    outputWindow.append(stderr.toString());
                    outputWindow.append(stdout.toString());
                    outputWindow.show(2);
                }
                resolve(ret);
            } catch (e) {
                reject(e);
            }
        });
    });
}

function parseErrors(lines: string[]): ICheckResult[] {
    var ret: ICheckResult[] = [];
    for (var i = 0; i < lines.length; i++) {
        let line = lines[i].trim();
        if (line.startsWith("Hint:") || line.endsWith("template/generic instantiation from here")) {
            continue;
        }
        var match = /^([^(]*)?\((\d+)(,\s(\d+))?\) (\w+): (.*)/.exec(line);
        if (!match) {
            if (ret.length > 0) {
                ret[ret.length - 1].msg += os.EOL + line;
            }
            continue;
        }
        var [_, file, lineStr, _, charStr, severity, msg] = match;
        ret.push({ file: getNormalizedWorkspacePath(file), line: parseInt(lineStr), column: parseInt(charStr), msg, severity });
    }
    return ret;
}

export function check(filename: string, nimConfig: vscode.WorkspaceConfiguration): Promise<ICheckResult[]> {
    var runningToolsPromises = [];
    var cwd = path.dirname(filename);

    if (!!nimConfig['buildOnSave']) {
        let projectFile = getProjectFile(filename);
        let args = ['--listFullPaths', projectFile]; 
        runningToolsPromises.push(nimExec(nimConfig['buildCommand'] || "c", args, true, true, parseErrors));
    }
    if (!!nimConfig['lintOnSave']) {
        let args = ['--listFullPaths', getProjectFile(filename)];
        runningToolsPromises.push(nimExec("check", args, true, false, parseErrors));
    }

    return Promise.all(runningToolsPromises).then(resultSets => [].concat.apply([], resultSets));
}

export function buildAndRun(filename: string): void {
    let config = vscode.workspace.getConfiguration('nim');
    var args = ['compile', '-r', '--listFullPaths', filename];
    var cwd = vscode.workspace.rootPath;
    cp.execFile(getNimExecPath(), args, { cwd: cwd }, (err, stdout, stderr) => {
        if (err && (<any>err).code == "ENOENT") {
            vscode.window.showInformationMessage("No 'nim' binary could be found in PATH: '" + process.env["PATH"] + "'");
            return;
        }
        var outputWindow = vscode.window.createOutputChannel("Nim Run Output");
        outputWindow.append(stderr.toString());
        outputWindow.append(stdout.toString());
        // display window in the second position (side or bottom)
        outputWindow.show(2);
    });
}