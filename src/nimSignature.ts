/*---------------------------------------------------------
 * Copyright (C) Xored Software Inc. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------*/

'use strict';

import vscode = require('vscode');
import { getDirtyFile } from './nimUtils'
import { execNimSuggest, INimSuggestResult, NimSuggestType } from './nimSuggestExec'

export class NimSignatureHelpProvider implements vscode.SignatureHelpProvider {

  public provideSignatureHelp(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken): Thenable<vscode.SignatureHelp> {
    return new Promise<vscode.SignatureHelp>((resolve, reject) => {
      resolve();
    });
  }
}