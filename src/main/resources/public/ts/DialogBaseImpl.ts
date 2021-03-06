import { CompIntf } from "./widget/base/CompIntf";

export interface DialogBaseImpl {

    open(display?: string): Promise<CompIntf>;
    close(): void;
    renderDlg(): CompIntf[];
    renderButtons(): CompIntf;
}
