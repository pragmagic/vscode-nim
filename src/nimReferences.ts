/*---------------------------------------------------------
 * Copyright (C) Xored Software Inc. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------*/

'use strict';

import vscode = require('vscode');
import { getDirtyFile } from './nimUtils';
import { execNimSuggest, NimSuggestType } from './nimSuggestExec';

export class NimReferenceProvider implements vscode.ReferenceProvider {

  public provideReferences(document: vscode.TextDocument, position: vscode.Position, options: { includeDeclaration: boolean }, token: vscode.CancellationToken): Thenable<vscode.Location[]> {
    return new Promise<vscode.Location[]>((resolve, reject) => {
      vscode.workspace.saveAll(false).then(() => {
          execNimSuggest(NimSuggestType.use, document.fileName, position.line + 1, position.character, getDirtyFile(document))
            .then(result => {
              var references: vscode.Location[] = [];
              if (result) {
                result.forEach(item => {
                  references.push(item.location);
                });
                resolve(references);
              } else {
                resolve();
              }
            })
            .catch(reason => reject(reason));
        });
    });
  }
}