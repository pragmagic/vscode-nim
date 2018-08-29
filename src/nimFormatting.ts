/*---------------------------------------------------------
 * Copyright (C) Xored Software Inc. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------*/

'use strict';

import vscode = require('vscode');
import cp = require('child_process');
import fs = require('fs');
import path = require('path');
import { getDirtyFile, getNimPrettyExecPath } from './nimUtils';

export class NimFormattingProvider implements vscode.DocumentFormattingEditProvider {

  public  provideDocumentFormattingEdits(document: vscode.TextDocument, options: vscode.FormattingOptions, token: vscode.CancellationToken): vscode.TextEdit[] | Thenable<vscode.TextEdit[]> {
    return new Promise((resolve, reject) => {
      getNimPrettyExecPath().then( binPath =>{
        if (binPath === '') {
          vscode.window.showInformationMessage('No \'nimpretty\' binary could be found in PATH environment variable');
          resolve([]);
        } else {
          let file = getDirtyFile(document);
          let res = cp.spawnSync(binPath, ['--backup:OFF', file], { cwd: vscode.workspace.rootPath });
  
          if (res.status !== 0) {
            reject(res.error);
          } else {
            let ext = path.extname(file);
            let prettyFile = path.join(path.dirname(file), path.basename(file, ext) + '.pretty' + ext);
            if (!fs.existsSync(prettyFile)) {
              reject(prettyFile + ' file not found');
            } else {
              let content = fs.readFileSync(prettyFile, 'utf-8');
              let range = document.validateRange(new vscode.Range(new vscode.Position(0, 0), new vscode.Position(1000000, 1000000)));
              resolve([vscode.TextEdit.replace(range, content)]);
            }
          }
        }
      })
    });
  }
}