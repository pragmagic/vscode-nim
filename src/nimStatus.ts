/*---------------------------------------------------------
 * Copyright (C) Xored Software Inc. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------*/

'use strict';

import { NIM_MODE } from './nimMode'
import vscode = require('vscode');

let statusBarEntry: vscode.StatusBarItem;
let progressBarEntry: vscode.StatusBarItem;

export function showHideStatus() {
  if (!statusBarEntry) {
    return;
  }
  if (!vscode.window.activeTextEditor) {
    statusBarEntry.hide();
    return;
  }
  if (vscode.languages.match(NIM_MODE, vscode.window.activeTextEditor.document)) {
    statusBarEntry.show();
    return;
  }
  statusBarEntry.hide();
}

export function hideNimStatus() {
  statusBarEntry.dispose();
}

export function hideNimProgress() {
  progressBarEntry.dispose();
}

export function showNimStatus(message: string, command: string, tooltip?: string) {
  statusBarEntry = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, Number.MIN_VALUE);
  statusBarEntry.text = message;
  statusBarEntry.command = command;
  statusBarEntry.color = 'yellow';
  statusBarEntry.tooltip = tooltip;
  statusBarEntry.show();
}

export function showNimProgress(message: string) {
  progressBarEntry = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, Number.MIN_VALUE);
  console.log(message);
  progressBarEntry.text = message;
  progressBarEntry.tooltip = message;
  progressBarEntry.show();
}

export function updateNimProgress(message: string) {
    progressBarEntry.text = message;
}