/*---------------------------------------------------------
 * Copyright (C) Xored Software Inc. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------*/

'use strict';

import vscode = require('vscode');
import { getDirtyFile } from './nimUtils';
import { execNimSuggest, NimSuggestResult, NimSuggestType } from './nimSuggestExec';


export class NimReferenceProvider implements vscode.ReferenceProvider {

  public provideReferences(document: vscode.TextDocument, position: vscode.Position, options: { includeDeclaration: boolean }, token: vscode.CancellationToken): Thenable<vscode.Location[]> {
    return new Promise((resolve, reject) => {
      vscode.workspace.saveAll(false).then(() => {
          execNimSuggest(NimSuggestType.use, document.fileName, position.line + 1, position.character, getDirtyFile(document))
            .then(result => {
              var references = [];
              result.forEach(item => {
                references.push(item.location);
              });
              resolve(references);
            })
            .catch(reason => reject(reason));
        });
    });
  }
}