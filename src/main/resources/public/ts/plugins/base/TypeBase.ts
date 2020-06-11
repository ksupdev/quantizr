import * as J from "../../JavaIntf";
import { Constants as C } from "../../Constants";
import { Singletons } from "../../Singletons";
import { PubSub } from "../../PubSub";
import { TypeHandlerIntf } from "../../intf/TypeHandlerIntf";
import { Comp } from "../../widget/base/Comp";
import { NodeCompMarkdown } from "../../comps/NodeCompMarkdown";
import { AppState } from "../../AppState";
import { CompIntf } from "../../widget/base/CompIntf";
import { store } from "../../AppRedux";

let S: Singletons;
PubSub.sub(C.PUBSUB_SingletonsReady, (ctx: Singletons) => {
    S = ctx;
});

/* NOTE: Defaults to only allowing 'admin' to edit unless allowPropertyEdit is overridden */
export class TypeBase implements TypeHandlerIntf {

    constructor(public readonly typeName: string, public readonly displayName: string, private iconStyle: string, private allowUserSelect: boolean) {
        let state: AppState = store.getState();
        if (state.isAdminUser) this.allowUserSelect = true;
    }

    getTypeName(): string {
        return this.typeName;
    }

    /* If this returns non-null the editor dialog is expected to show only the enumerated properties for editing */
    getCustomProperties(): string[] {
        return null;
    }

    /* Types can override this to ensure that during node editing there is a hook to prefill and create any properties that are
    required to exist on that type of node in case they aren't existing yet */
    ensureDefaultProperties(node: J.NodeInfo) {
    }

    getName(): string {
        return this.displayName;
    }

    allowPropertyEdit(propName: string, state: AppState): boolean {
        return true;
    }

    render(node: J.NodeInfo, rowStyling: boolean, state: AppState): Comp {
        return new NodeCompMarkdown(node);
    }

    orderProps(node: J.NodeInfo, _props: J.PropertyInfo[]): J.PropertyInfo[] {
        return _props;
    }

    getIconClass(): string {
        //https://www.w3schools.com/icons/fontawesome_icons_webapp.asp
        if (!this.iconStyle) return null;
        return "fa " + this.iconStyle + " fa-lg";
    }

    allowAction(action: string): boolean {
        return true;
    }

    getAllowUserSelect(): boolean {
        return this.allowUserSelect;
    }

    getDomPreUpdateFunction(parent: CompIntf): void {
    }

    ensureStringPropExists(node: J.NodeInfo, propName: string) {
        let prop: J.PropertyInfo = S.props.getNodeProp(propName, node);
        if (!prop) {
            if (!node.properties) {
                node.properties = [];
            }

            node.properties.push({
                name: propName,
                value: ""
            });
        }
    }
}


