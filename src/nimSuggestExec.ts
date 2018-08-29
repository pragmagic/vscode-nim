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
import net = require('net');
import elrpc = require('./elrpc/elrpc');
import sexp = require('./elrpc/sexp');
import { prepareConfig, getProjectFile, isProjectMode, getNimExecPath, removeDirSync, correctBinname } from './nimUtils';
import { hideNimStatus, showNimStatus } from './nimStatus';

class NimSuggestProcessDescription {
    process: cp.ChildProcess;
    rpc: elrpc.EPCPeer;
}

let nimSuggestProcessCache: { [project: string]: PromiseLike<NimSuggestProcessDescription> } = {};
var _nimSuggestPath: string = undefined;
var _nimSuggestVersion: string = undefined;

export enum NimSuggestType {
    /** Suggest from position */
    sug,
    /** Get context from position */
    con,
    /** Get symbol definition from position */
    def,
    /** Get references of symbol from position */
    use,
    /** Get usage of symbol from position in project */
    dus,
    /** Ivoke nim check on file */
    chk,
    /** Returns all tokens in file (symbolType, line, pos, lenght) */
    highlight,
    /** Get outline symbols for file */
    outline,
    /** Returns 'true' if given file is related to the project, otherwise 'false'  */
    known
}
/**
 * Parsed string line from nimsuggest utility.
 */
export class NimSuggestResult {

    /** Three characters indicating the type of returned answer
     * (e.g. def for definition, sug for suggestion, etc). */
    answerType: string;

    /** Type of the symbol. This can be skProc, skLet, and just
     *  about any of the enums defined in the module compiler/ast.nim. */
    suggest: string;

    /** Full qualitifed path of the symbol.If you are querying a symbol
     * defined in the proj.nim file, this would have the form [proj, symbolName]. */
    names: string[];

    /** Type / signature.For variables and enums this will contain the type
     * of the symbol, for procs, methods and templates this will contain the
     * full unique signature (e.g.proc(File)). */
    type: string;

    /** Full path to the file containing the symbol. */
    path: string;

    /** Line where the symbol is located in the file.Lines start to count at 1. */
    line: number;

    /** Column where the symbol is located in the file.Columns start to count at 0. */
    column: number;

    /** Docstring for the symbol if available or the empty string.
     * To differentiate the docstring from end of answer in server mode,
     * the docstring is always provided enclosed in double quotes, and if
     * the docstring spans multiple lines, all following lines of the docstring
     * will start with a blank space to align visually with the starting quote.
     * //
     * Also, you won't find raw \n characters breaking the one answer per line format.
     * Instead you will need to parse sequences in the form \xHH, where HH
     * is a hexadecimal value (e.g. newlines generate the sequence \x0A). */
    documentation: string;

    get range(): vscode.Range {
        return new vscode.Range(this.line - 1, this.column, this.line - 1, this.column);
    }

    get position(): vscode.Position {
        return new vscode.Position(this.line - 1, this.column);
    }

    get uri(): vscode.Uri {
        return vscode.Uri.file(this.path);
    }

    get location(): vscode.Location {
        return new vscode.Location(this.uri, this.position);
    }

    get fullName(): string {
        return this.names ? this.names.join('.') : '';
    }

    get symbolName(): string {
        return this.names ? this.names[this.names.length - 1] : '';
    }

    get moduleName(): string {
        return this.names ? this.names[0] : '';
    }

    get containerName(): string {
        return this.names ? this.names.slice(0, this.names.length - 1).join('.') : '';
    }
}

export function getNimSuggestPath(): string {
    return _nimSuggestPath;
}

export function getNimSuggestVersion(): string {
    return _nimSuggestVersion;
}

/**
 * Returns true if nimsuggest version is great or equals to given.
 * @param version version to match
 */
export function isNimSuggestVersion(version: string): boolean {
    if (!_nimSuggestVersion) {
        return false;
    }
    let nimVersionParts = _nimSuggestVersion.split('.');
    let versionParts = version.split('.');
    for (var i = 0; i < Math.min(nimVersionParts.length, versionParts.length); i++) {
        let diff = parseInt(nimVersionParts[i]) - parseInt(versionParts[i]);
        if (diff === 0) {
            continue;
        }
        return diff > 0;
    }
    return true;
}

export async function initNimSuggest(ctx: vscode.ExtensionContext) {
    prepareConfig();
    // let check nimsuggest related nim executable
    let binPath = await getNimExecPath()
    let nimSuggestNewPath = path.resolve(path.dirname(binPath), correctBinname('nimsuggest'));
    if (fs.existsSync(nimSuggestNewPath)) {
        _nimSuggestPath = nimSuggestNewPath;
        let versionOutput = cp.spawnSync(getNimSuggestPath(), ['--version'], { cwd: vscode.workspace.rootPath }).output.toString();
        let versionArgs = /.+Version\s([\d|\.]+)\s\(.+/g.exec(versionOutput);
        if (versionArgs && versionArgs.length === 2) {
            _nimSuggestVersion = versionArgs[1];
        }

        console.log(versionOutput);
        console.log('Nimsuggest version: ' + _nimSuggestVersion);
    }
    vscode.workspace.onDidChangeConfiguration(prepareConfig);
}

function trace(pid: number, projectFile: string, msg: any): void {
    if (!!vscode.workspace.getConfiguration('nim').get('logNimsuggest')) {
        console.log('[' + pid + ':' + projectFile + ']');
        console.log(msg);
    }
}

export async function execNimSuggest(suggestType: NimSuggestType, filename: string,
    line: number, column: number, dirtyFile?: string): Promise<NimSuggestResult[]> {
    var nimSuggestExec = getNimSuggestPath();
    // if nimsuggest not found just ignore
    if (!nimSuggestExec) {
        return [];
    }
    try {
        let projectFile = getProjectFile(filename);
        let normalizedFilename = filename.replace(/\\+/g, '/');
        let desc = await getNimSuggestProcess(projectFile);
        let suggestCmd = NimSuggestType[suggestType];
        trace(desc.process.pid, projectFile, suggestCmd + ' ' + normalizedFilename + ':' + line + ':' + column);
        let ret = await desc.rpc.callMethod(suggestCmd, { kind: 'string', str: normalizedFilename }, { kind: 'number', n: line }, { kind: 'number', n: column }, { kind: 'string', str: dirtyFile });
        trace(desc.process.pid, projectFile + '=' + suggestCmd + ' ' + normalizedFilename, ret);

        var result: NimSuggestResult[] = [];
        if (ret != null) {
            if (ret instanceof Array) {
                for (var i = 0; i < ret.length; i++) {
                    var parts = ret[i];
                    if (parts.length >= 8) {
                        var item = new NimSuggestResult();
                        item.answerType = parts[0];
                        item.suggest = parts[1];
                        item.names = parts[2];
                        item.path = parts[3].replace(/\\,\\/g, '\\');
                        item.type = parts[4];
                        item.line = parts[5];
                        item.column = parts[6];
                        var doc = parts[7];
                        if (doc !== '') {
                            doc = doc.replace(/\`\`/g, '`');
                            doc = doc.replace(/\.\. code-block:: (\w+)\r?\n(( .*\r?\n?)+)/g, '```$1\n$2\n```\n');
                            doc = doc.replace(/\`([^\<\`]+)\<([^\>]+)\>\`\_/g, '\[$1\]\($2\)');
                        }
                        item.documentation = doc;
                        result.push(item);
                    }
                }
            } else if (ret === 'EPC Connection closed') {
                console.error(ret);
                await closeNimSuggestProcess(filename);
            } else {
                var item = new NimSuggestResult();
                item.suggest = '' + ret;
                result.push(item);
            }
        }
        if (!isProjectMode() &&
            vscode.window.visibleTextEditors.every((value, index, array) => { return value.document.uri.fsPath !== filename; })) {
            await closeNimSuggestProcess(filename);
        }
        return result;
    } catch (e) {
        console.error(e);
        await closeNimSuggestProcess(filename);
    }
}

export async function closeAllNimSuggestProcesses(): Promise<void> {
    for (var project in nimSuggestProcessCache) {
        let desc = await nimSuggestProcessCache[project];
        desc.rpc.stop();
        desc.process.kill();
    }
    nimSuggestProcessCache = {};
}

export async function closeNimSuggestProcess(filename: string): Promise<void> {
    var file = getProjectFile(filename);
    if (nimSuggestProcessCache[file]) {
        let desc = await nimSuggestProcessCache[file];
        desc.rpc.stop();
        desc.process.kill();
        nimSuggestProcessCache[file] = undefined;
    }
}

async function getNimSuggestProcess(nimProject: string): Promise<NimSuggestProcessDescription> {
    if (!nimSuggestProcessCache[nimProject]) {
        nimSuggestProcessCache[nimProject] = new Promise<NimSuggestProcessDescription>((resolve, reject) => {
            let nimConfig = vscode.workspace.getConfiguration('nim');
            var args = ['--epc', '--v2'];
            if (!!nimConfig['logNimsuggest']) {
                args.push('--log');
            }
            if (!!nimConfig['useNimsuggestCheck']) {
                args.push('--refresh:on');
            }

            args.push(nimProject);
            let process = cp.spawn(getNimSuggestPath(), args, { cwd: vscode.workspace.rootPath });
            process.stdout.once('data', (data) => {
                let dataStr = data.toString();
                let portNumber = parseInt(dataStr);
                if (isNaN(portNumber)) {
                    reject('Nimsuggest returns unknown port number: ' + dataStr);
                } else {
                    elrpc.startClient(portNumber).then((peer) => {
                        resolve({ process: process, rpc: peer });
                    });
                }
            });
            process.stdout.once('data', (data) => {
                console.log(data.toString());
            });
            process.stderr.once('data', (data) => {
                console.log(data.toString());
            });
            process.on('close', (code: number, signal: string) => {
                if (code !== 0) {
                    console.error('nimsuggest closed with code: ' + code + ', signal: ' + signal);
                }
                if (nimSuggestProcessCache[nimProject]) {
                    nimSuggestProcessCache[nimProject].then((desc) => {
                        desc.rpc.stop();
                    });
                }
                reject();
            });
        });
    }
    return nimSuggestProcessCache[nimProject];
}
