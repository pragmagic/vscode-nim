/*---------------------------------------------------------
 * Copyright (C) Xored Software Inc. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------*/

'use strict';

import vscode = require('vscode');
import cp = require('child_process');

import { showNimStatus, hideNimStatus } from './nimStatus'
import { getNimExecPath, getNimbleExecPath, getNimSuggestExecPath } from './nimUtils'

export function offerToInstallTools() {
    if (!getNimExecPath()) {
        return;
    }

    if (!getNimbleExecPath()) {
        return;
    }

    if (!!getNimSuggestExecPath()) {
        return;
    }

    showNimStatus('Nimsuggest Tools Missing', 'nim.promptforinstall', 'Nimsuggest installed');
    vscode.commands.registerCommand('nim.promptforinstall', () => {
        promptForInstallNimSuggest();
        hideNimStatus();
    });

    function promptForInstallNimSuggest() {
        let item = {
            title: 'Install',
            command() {
                var outputWindow = vscode.window.createOutputChannel("Nimble Output");
                outputWindow.show(2);
                var proc = cp.spawn(getNimbleExecPath(), ["install", "nimsuggest", "-y"]);
                proc.stdout.on('data', function(chunk) {
                    outputWindow.append(chunk.toString());
                });
                proc.stderr.on('data', function(chunk) {
                    outputWindow.append(chunk.toString());
                });
                proc.on('close', function(code) {
                    if (code === 0) {
                        // if installed successfully get path
                        outputWindow.append(getNimSuggestExecPath());
                    }
                });
            }
        };
        vscode.window.showInformationMessage('Nimsuggest tools are missing from your PATH.  Would you like to install them?', item).then(selection => {
            if (selection) {
                selection.command();
            }
        });
    }
}