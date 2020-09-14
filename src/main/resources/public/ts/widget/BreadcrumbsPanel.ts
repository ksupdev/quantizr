import { ReactNode } from "react";
import { useSelector } from "react-redux";
import { AppState } from "../AppState";
import { Constants as C } from "../Constants";
import { TypeHandlerIntf } from "../intf/TypeHandlerIntf";
import { PubSub } from "../PubSub";
import { Singletons } from "../Singletons";
import { Comp } from "./base/Comp";
import { Button } from "./Button";
import { Div } from "./Div";
import { Li } from "./Li";
import { NavTag } from "./NavTag";
import { Span } from "./Span";
import { Ul } from "./Ul";

let S: Singletons;
PubSub.sub(C.PUBSUB_SingletonsReady, (ctx: Singletons) => {
    S = ctx;
});

export class BreadcrumbsPanel extends NavTag {

    compRender(): ReactNode {
        const state: AppState = useSelector((state: AppState) => state);
        this.attribs.className = "navbar navbar-expand navbar-dark bg-dark main-navbar breadcrumbPanel";

        this.setChildren([
            new Ul(null, {
                className: "navbar-nav"
            }, [
                new Li(null, {
                    className: "nav-item"
                }, [
                    this.createBreadcrumbs(state)
                ])
            ])
        ]);

        return this.tagRender("nav", this.content, this.attribs);
    }

    createBreadcrumbs = (state: AppState): Comp => {
        if (!state.breadcrumbs || state.breadcrumbs.length === 0) return new Span("Loading...");

        let children = [];
        state.breadcrumbs.forEach(bc => {
            if (bc.id) {
                if (!bc.name) {
                    const typeHandler: TypeHandlerIntf = S.plugin.getTypeHandler(bc.type);
                    if (typeHandler) {
                        bc.name = typeHandler.getName();
                    }
                    else {
                        bc.name = "???";
                    }
                }

                if (children.length > 0) {
                    children.push(new Span("/", {
                        className: "marginRight breadcrumbSlash"
                    }));
                }

                children.push(new Span(bc.name, {
                    onClick: () => { S.view.refreshTree(bc.id, true, bc.id, false, false, true, true, state); },
                    className: "marginRight breadcrumbItem"
                }));
            }
            else {
                children.push(new Span("...", { className: "marginRight" }));
            }
        });

        return new Div(null, null, children);
    }
}