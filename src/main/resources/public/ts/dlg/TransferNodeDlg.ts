import * as J from "../JavaIntf";
import { PasswordTextField } from "../widget/PasswordTextField";
import { ButtonBar } from "../widget/ButtonBar";
import { Button } from "../widget/Button";
import { TextField } from "../widget/TextField";
import { Form } from "../widget/Form";
import { FormGroup } from "../widget/FormGroup";
import { Constants as C} from "../Constants";
import { Singletons } from "../Singletons";
import { PubSub } from "../PubSub";
import { DialogBase } from "../DialogBase";
import { Checkbox } from "../widget/Checkbox";

let S: Singletons;
PubSub.sub(C.PUBSUB_SingletonsReady, (ctx: Singletons) => {
    S = ctx;
});

export class TransferNodeDlg extends DialogBase {

    recursiveCheckBox: Checkbox;
    fromTextField: TextField;
    toTextField: PasswordTextField;

    constructor() {
        super("Transfer Node", "app-modal-content-narrow-width");

        this.setChildren([
            new Form(null, [
                new FormGroup(null,
                    [
                        this.fromTextField = new TextField("From User"),
                        this.toTextField = new TextField("To User"),
                    ]
                ),
                new FormGroup(null,
                    [
                        this.recursiveCheckBox = new Checkbox("Include Sub-Nodes"),
                    ]
                ),
                new ButtonBar(
                    [
                        new Button("Transfer", this.transfer, null, "primary"),
                        new Button("Close", () => {
                            this.close();
                        })
                    ])
            ])
        ]);
    }

    transfer = (): void => {
        let fromUser = this.fromTextField.getValue();
        let toUser = this.toTextField.getValue();
        if (!fromUser || !toUser) {
            S.util.showMessage("To and From user names are required.");
            return;
        }
        let node: J.NodeInfo = S.meta64.getHighlightedNode();
        if (!node) {
            S.util.showMessage("No node was selected.");
            return;
        }
        let recursive = this.recursiveCheckBox.getChecked();
        S.user.transferNode(recursive, node.id, fromUser, toUser);
        this.close();
    }
}