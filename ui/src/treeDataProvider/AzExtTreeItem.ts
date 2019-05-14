/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { TreeItemCollapsibleState, Uri } from 'vscode';
import * as types from '../../index';
import { NotImplementedError } from '../errors';
import { localize } from '../localize';
import { nonNullProp } from '../utils/nonNull';
import { IAzExtParentTreeItemInternal, IAzExtTreeDataProviderInternal } from "./InternalInterfaces";
import { loadingIconPath } from "./treeConstants";

export abstract class AzExtTreeItem implements types.AzExtTreeItem {
    //#region Properties implemented by base class
    public abstract label: string;
    public abstract contextValue: string;
    public description?: string;
    public id?: string;
    public commandId?: string;
    public iconPath?: string | Uri | { light: string | Uri; dark: string | Uri };
    //#endregion

    public readonly collapsibleState: TreeItemCollapsibleState | undefined;
    public readonly parent: IAzExtParentTreeItemInternal | undefined;
    private _temporaryDescription?: string;
    private _treeDataProvider: IAzExtTreeDataProviderInternal | undefined;

    public constructor(parent: IAzExtParentTreeItemInternal | undefined) {
        this.parent = parent;
    }

    private get _effectiveDescription(): string | undefined {
        return this._temporaryDescription || this.description;
    }

    public get fullId(): string {
        if (this.parent === undefined) {
            return ''; // root tree item should not have an id since it's not actually displayed
        } else {
            let id: string = this.id || this.label;
            if (!id.startsWith('/')) {
                id = `/${id}`;
            }

            // For the sake of backwards compat, only add the parent's id if it's not already there
            if (!id.startsWith(this.parent.fullId)) {
                id = `${this.parent.fullId}${id}`;
            }

            return id;
        }
    }

    public get effectiveIconPath(): string | Uri | { light: string | Uri; dark: string | Uri } | undefined {
        return this._temporaryDescription ? loadingIconPath : this.iconPath;
    }

    public get effectiveLabel(): string {
        return this._effectiveDescription ? `${this.label} (${this._effectiveDescription})` : this.label;
    }

    public get treeDataProvider(): IAzExtTreeDataProviderInternal {
        // tslint:disable-next-line: strict-boolean-expressions
        return this._treeDataProvider || nonNullProp(this, 'parent').treeDataProvider;
    }

    public set treeDataProvider(val: IAzExtTreeDataProviderInternal) {
        this._treeDataProvider = val;
    }

    //#region Methods implemented by base class
    public refreshImpl?(): Promise<void>;
    public isAncestorOfImpl?(contextValue: string | RegExp): boolean;
    public deleteTreeItemImpl?(): Promise<void>;
    //#endregion

    public async refresh(): Promise<void> {
        await this.treeDataProvider.refresh(this);
    }

    public includeInTreePicker(expectedContextValues: (string | RegExp)[]): boolean {
        return expectedContextValues.some((val: string | RegExp) => {
            return this.contextValue === val ||
                (val instanceof RegExp && val.test(this.contextValue)) ||
                !this.isAncestorOfImpl ||
                this.isAncestorOfImpl(val);
        });
    }

    public async deleteTreeItem(): Promise<void> {
        await this.runWithTemporaryDescription(localize('deleting', 'Deleting...'), async () => {
            if (this.deleteTreeItemImpl) {
                await this.deleteTreeItemImpl();
                if (this.parent) {
                    this.parent.removeChildFromCache(this);
                }
            } else {
                throw new NotImplementedError('deleteTreeItemImpl', this);
            }
        });
    }

    public async runWithTemporaryDescription(description: string, callback: () => Promise<void>): Promise<void> {
        this._temporaryDescription = description;
        try {
            this.treeDataProvider.refreshUIOnly(this);
            await callback();
        } finally {
            this._temporaryDescription = undefined;
            await this.refresh();
        }
    }
}
