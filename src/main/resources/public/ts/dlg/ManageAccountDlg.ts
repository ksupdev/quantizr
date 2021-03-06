import { AppState } from "../AppState";
import { Constants as C } from "../Constants";
import { DialogBase } from "../DialogBase";
import * as J from "../JavaIntf";
import { PubSub } from "../PubSub";
import { Singletons } from "../Singletons";
import { CompIntf } from "../widget/base/CompIntf";
import { Button } from "../widget/Button";
import { ButtonBar } from "../widget/ButtonBar";
import { CollapsiblePanel } from "../widget/CollapsiblePanel";
import { TextContent } from "../widget/TextContent";

let S: Singletons;
PubSub.sub(C.PUBSUB_SingletonsReady, (ctx: Singletons) => {
    S = ctx;
});

export class ManageAccountDlg extends DialogBase {

    constructor(state: AppState) {
        super("Manage Account", null, false, state);
    }

    renderDlg(): CompIntf[] {
        return [
            new TextContent(this.getState().info, null, true),

            new CollapsiblePanel(null, null, null, [
                new Button("Close Account", this.closeAccount)
            ], false, null, false, "float-right"),

            new ButtonBar([
                new Button("Close", this.close)
            ])
        ];
    }

    renderButtons(): CompIntf {
        return null;
    }

    preLoad(): Promise<void> {
        return new Promise<void>((resolve, reject) => {
            S.util.ajax<J.GetUserAccountInfoRequest, J.GetUserAccountInfoResponse>("getUserAccountInfo", null,
                (res: J.GetUserAccountInfoResponse) => {
                    let used = "";
                    if (res.binQuota <= 0) {
                        res.binQuota = 20 * 1024 * 1024;
                    }
                    if (res.binQuota > 0) {
                        if (res.binTotal < 10) {
                            used = "0%";
                        }
                        else {
                            used = (res.binTotal * 100 / res.binQuota).toFixed(1) + "%";
                        }
                    }

                    let info = //
                        "Your Storage Quota: " + S.util.formatMemory(res.binQuota) + "\n" +//
                        "Storage Used: " + S.util.formatMemory(res.binTotal) + "\n" +//
                        "Percent Used: " + used;

                    this.mergeState({ info });
                    resolve();
                });
        });
    }

    closeAccount = (state: AppState): void => {
        S.user.closeAccount(state);
        this.close();
    }
}
