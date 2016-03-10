/*---------------------------------------------------------
 * Copyright (C) Xored Software Inc. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------*/

"use strict";

import * as cp from 'child_process';
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {DebugSession, InitializedEvent, TerminatedEvent, StoppedEvent, BreakpointEvent, OutputEvent, Thread, StackFrame, Scope, Source, Handles, Breakpoint} from 'vscode-debugadapter';
import {DebugProtocol} from 'vscode-debugprotocol';

export interface LaunchRequestArguments {
    /** An absolute path to the program to debug. */
    program: string;
    args?: string[];
    cwd?: string;
    /** Automatically stop target after launch. If not specified, target does not stop. */
    stopOnEntry?: boolean;
}

interface DebugCommand {
    command: string
    resolve: () => void;
    responseHandler: (response: string) => void;
}

class NimDebugSession extends DebugSession {

    // we don't support multiple threads, so we can use a hardcoded ID for the default thread
    private static THREAD_ID = 1;

    // since we want to send breakpoint events, we will assign an id to every event
    // so that the frontend can match events with breakpoints.
    private _breakpointId = 1000;

    private _process: cp.ChildProcess;

    private _breakPoints = new Map<string, DebugProtocol.Breakpoint[]>();

    private _variableHandles = new Handles<string>();
    private _commandQueue: Array<DebugCommand> = [];
    private _cwd: string;
    private _nimPath: string;
    private _initialized: boolean = false;
    private _packets: string[] =  [];
    private _buffer: string = "";
    private _currentCommand: DebugCommand;

    public constructor() {
        super();
        this.setDebuggerLinesStartAt1(true);
        this.setDebuggerColumnsStartAt1(false);
    }

    private debug(s: string): void {
        this.sendEvent(new OutputEvent(`debug: ${s}\n`));
    }

    private out(s: string): void {
        this.sendEvent(new OutputEvent(s));
    }

    private sendCommand(s: string, responseHandler: (response: string) => void): void {
        this._commandQueue.push({ command: s, resolve: null, responseHandler: responseHandler });
        if (this._commandQueue.length == 1) {
            this.processCommandQueue();
        }
    }

    private processCommandQueue(): void {
        if (this._commandQueue.length > 0) {
            new Promise((resolve, reject) => {
                let cmd = this._commandQueue.pop();
                cmd.resolve = resolve;
                this.debug("exec: " + cmd.command);
                this._currentCommand = cmd;
                this._process.stdin.write(cmd.command + "\n");
            }).then((data) => {
                this.processCommandQueue();
            });
        }
    }
    
	/**
	 * The 'initialize' request is the first request called by the frontend
	 * to interrogate the features the debug adapter provides.
	 */
    protected initializeRequest(response: DebugProtocol.InitializeResponse, args: DebugProtocol.InitializeRequestArguments): void {
        this._initialized = false;
        this.sendEvent(new InitializedEvent());
        response.body.supportsConfigurationDoneRequest = false;
        this.debug("init");
        this.sendResponse(response);
    }

    protected launchRequest(response: DebugProtocol.LaunchResponse, args: LaunchRequestArguments): void {
        var execPath = args.program;
        this._cwd = args.cwd;

        if (!fs.existsSync(execPath)) {
            this.sendErrorResponse(response, 0, "Executable file not found: " + args.program);
            this.sendEvent(new TerminatedEvent());
        }

        this.debug("launch : " + execPath + ": " + args.args);
        try {
            this._process = cp.spawn(execPath, args.args, { cwd: args.cwd ? args.cwd : path.basename(execPath) });
            this._process.stderr.on('data', (data) => {
                this.debug(`stderr: ${data}`);
            });
            let packetStart = "*** endb| ";
            let packetEnd = "***" + os.EOL;
            let prompt = "*** endb| >>";
            this._process.stdout.on('data', (data) => {
                this._buffer += data.toString();
                this._buffer = this._buffer.replace(prompt, "");
                this.out("#" + this._buffer + "#");
                
                var idxStart = this._buffer.indexOf(packetStart);
                var idxEnd = this._buffer.indexOf(packetEnd);
                while (idxStart >= 0 && idxStart < idxEnd) {
                    let result = this._buffer.substring(idxStart + packetStart.length, idxEnd).trim();
                    this._buffer = this._buffer.substr(idxEnd + packetEnd.length);
                    if (this._currentCommand) {
                        this._currentCommand.resolve();
                        this._currentCommand.responseHandler(result);
                        this._currentCommand = null;
                    }
                    idxStart = this._buffer.indexOf(packetStart);
                    idxEnd = this._buffer.indexOf(packetEnd);
                }
                // let idxS = str.indexOf("*** endb| ");
                //     if (idxS >= 0) {
                //         let idxE = str.lastIndexOf("***" + os.EOL);
                //         if (idxE >= 0) {
                //             //this.out(`'${str}'`);
                //             let out = str.substring(str.indexOf(">>") + 2, str.lastIndexOf("*** endb| "));
                //             if (out !== endbPrompt) {
                //                 this.out(out);
                //             }
                //             let response = str.substring(str.lastIndexOf("*** endb| ") + prefixSLen, idxE - 1);
                //             this.debug("!" + response.indexOf(">>") ? response.substr(2) : response + "!!!!");
                //             this._process.stdout.removeListener('data', listener);
                //             cmd.responseHandler(response.indexOf(">>") ? response.substr(2) : response);
                //         }
                //     }
                // };
            });
            this._process.on("close", (res) => {
                this.debug("closed : " + res);
                this.shutdown();
            });
        } catch (e) {
            this.debug("error running executable");
        }

        // if (args.stopOnEntry) {
        //     this.sendResponse(response);

        //     // we stop on the first line
        //     this.sendEvent(new StoppedEvent("entry", NimDebugSession.THREAD_ID));
        // } else {
        //     // we just start to run until we hit a breakpoint or an exception
        //     this.continueRequest(response, { threadId: NimDebugSession.THREAD_ID });
        // }
        this.sendCommand("w", (res) => {
            this.debug("launch done");
            this._initialized = true;
            this.sendEvent(new StoppedEvent("entry", NimDebugSession.THREAD_ID));
            this.sendResponse(response);
        });
    }

    protected disconnectRequest(response: DebugProtocol.DisconnectResponse, args: DebugProtocol.DisconnectArguments): void {
        this._process.stdin.write("q\n");
        this.sendResponse(response);
    }

    protected setBreakPointsRequest(response: DebugProtocol.SetBreakpointsResponse, args: DebugProtocol.SetBreakpointsArguments): void {
        this.debug("set breakpoints");
        this.debug(args.source.path)
        this._breakPoints[args.source.path] = args.breakpoints;
        
        var breakpoints = new Array<Breakpoint>();
        response.body = {
            breakpoints: breakpoints
        };
        this.sendResponse(response);
    }

    protected threadsRequest(response: DebugProtocol.ThreadsResponse): void {
        this.debug("threads");
        // return the default thread
        response.body = {
            threads: [
                new Thread(NimDebugSession.THREAD_ID, "thread 1")
            ]
        };
        this.sendResponse(response);
    }

    protected stackTraceRequest(response: DebugProtocol.StackTraceResponse, args: DebugProtocol.StackTraceArguments): void {
        this.debug("stacktrace");
        const frames = new Array<StackFrame>();
        this.sendCommand("backtrace", (res) => {
            let lines = res.split(os.EOL);
            for (let i = 0; i < lines.length; i++) {
                var match = /([^\(]+)\((\d+)\)\s+(.*)/.exec(lines[i]);
                if (!match) continue;
                var [_, file, lineStr, name] = match;
                frames.push(new StackFrame(i, name,
                    new Source(file, this.convertDebuggerPathToClient(file)),
                    this.convertDebuggerLineToClient(parseInt(lineStr)), 0)
                );
            }
            response.body = {
                stackFrames: frames.reverse()
            };
            this.sendResponse(response);
        });
    }

    protected scopesRequest(response: DebugProtocol.ScopesResponse, args: DebugProtocol.ScopesArguments): void {
        this.debug("scopes");

        const frameReference = args.frameId;
        const scopes = new Array<Scope>();
        scopes.push(new Scope("Local", this._variableHandles.create("local" + frameReference), false));
        scopes.push(new Scope("Global", this._variableHandles.create("global" + frameReference), true));

        response.body = {
            scopes: scopes
        };
        this.sendResponse(response);
    }

    protected variablesRequest(response: DebugProtocol.VariablesResponse, args: DebugProtocol.VariablesArguments): void {
        this.debug("variables");
        const variables = [];
        this.sendCommand("locals", (res) => {
            const id = this._variableHandles.get(args.variablesReference);
            //this.out("!!" + args.variablesReference + " : " + id);
            if (id != null) {
                variables.push({
                    name: id + "_i",
                    value: "123",
                    variablesReference: 0
                });
                variables.push({
                    name: id + "_f",
                    value: "3.14",
                    variablesReference: 0
                });
                variables.push({
                    name: id + "_s",
                    value: "hello world",
                    variablesReference: 0
                });
                variables.push({
                    name: id + "_o",
                    value: "Object",
                    variablesReference: this._variableHandles.create("object_")
                });
            }

            response.body = {
                variables: variables
            };
            this.sendResponse(response);
        });
    }

    protected continueRequest(response: DebugProtocol.ContinueResponse, args: DebugProtocol.ContinueArguments): void {
        this.debug("continue");
        this.sendCommand("continue", (res) => {
            this.sendResponse(response);
        });
    }

    protected nextRequest(response: DebugProtocol.NextResponse, args: DebugProtocol.NextArguments): void {
        this.debug("next");
        this.sendCommand("next", (res) => {
            this.sendEvent(new StoppedEvent("entry", NimDebugSession.THREAD_ID));
            this.sendResponse(response);
        });
    }

    protected stepInRequest(response: DebugProtocol.StepInResponse, args: DebugProtocol.StepInArguments): void {
        this.debug("stepIn");
        this.sendCommand("step", (res) => {
            this.sendEvent(new StoppedEvent("entry", NimDebugSession.THREAD_ID));
            this.sendResponse(response);
        });
    }

    protected stepOutRequest(response: DebugProtocol.StepOutResponse, args: DebugProtocol.StepOutArguments): void {
        this.debug("stepOut");
        this.sendCommand("skipcurrent", (res) => {
            this.sendEvent(new StoppedEvent("entry", NimDebugSession.THREAD_ID));
            this.sendResponse(response);
        });
    }

    protected evaluateRequest(response: DebugProtocol.EvaluateResponse, args: DebugProtocol.EvaluateArguments): void {
        this.debug("eval");
        this.sendCommand(`eval ${args.expression}`, (res) => {
            var value = "";
            if (res && res.indexOf("=") > 0) {
            this.out("!" + res + "!");
                var [name, val] = res.split("=");
                if (name.trim() === args.expression) {
                    value = val.trim();
                }
            }
            response.body = {
                result: value,
                variablesReference: 0
            };
            this.sendResponse(response);
        });
    }

    protected convertDebuggerPathToClient(debuggerPath: string): string {
        if (path.isAbsolute(debuggerPath)) {
            return debuggerPath;
        }

        if (fs.existsSync(debuggerPath)) {
            return debuggerPath;
        }

        var file = path.resolve(this._cwd, debuggerPath);
        if (fs.existsSync(file)) {
            return file;
        }

        file = path.resolve(path.dirname(this.getNimHome()), debuggerPath);
        
        // if (fs.existsSync(file)) {
        //     return file;
        // }
        
        return debuggerPath;
    }
    private getNimHome(): string {
        if (this._nimPath) return this._nimPath;
        if (process.env["PATH"]) {
            var pathparts = (<string>process.env.PATH).split((<any>path).delimiter);
            var binname = "nim";
            if (process.platform === 'win32') {
                return binname + ".exe";
            }
            this._nimPath = pathparts.map(dir => path.join(dir, binname)).filter(candidate => fs.existsSync(candidate))[0];
            if (this._nimPath) {
                this._nimPath = path.dirname(this._nimPath);
            }
        }
        return this._nimPath;
    }
}

DebugSession.run(NimDebugSession);
