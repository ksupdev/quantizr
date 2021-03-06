// https://reactjs.org/docs/react-api.html
// https://reactjs.org/docs/hooks-reference.html#usestate
// #RulesOfHooks: https://fb.me/rules-of-hooks

import { ReactElement, ReactNode, useEffect, useLayoutEffect, useState } from "react";
import * as ReactDOM from "react-dom";
import { renderToString } from "react-dom/server";
import { Provider, useSelector } from "react-redux";
import { AppState } from "../../AppState";
import { Constants as C } from "../../Constants";
import { PubSub } from "../../PubSub";
import { Singletons } from "../../Singletons";
import { BaseCompState } from "./BaseCompState";
import { CompIntf } from "./CompIntf";

// tip: merging two objects: this.state = { ...this.state, ...moreState };

let S: Singletons;
PubSub.sub(C.PUBSUB_SingletonsReady, (ctx: Singletons) => {
    S = ctx;
});

/**
 * This base class is a hybrid that can render React components or can be used to render plain HTML to be used in innerHTML of elements.
 * The innerHTML approach is being phased out in order to transition fully over to normal ReactJS.
 */
export abstract class Comp<S extends BaseCompState = any> implements CompIntf {
    static renderCounter: number = 0;
    public rendered: boolean = false;
    public debug: boolean = false;
    public debugState: boolean = false;
    private static guid: number = 0;

    // This is boolean is kinda tricky. It is needed for when we have text inputs bound to state by onChange to update state
    // and end up setting state into parent which forces a rerender, and destroys the focus and cursor position as the render creates a NEW
    // component, and this flag makes the component keep the same 'key' attribute by not rendering with new keys on all elements during onChange
    // So reuseChildren tells the component keep children if they exist. (mainly only functional in Dialogs currently)
    static renderCachedChildren: boolean = false;

    state: S = {} as any;
    attribs: any;

    /* this is a more powerful of doing what React.memo can do but supports keys in a better way than React.memo, because
    rect memo, relies on props, and we want to be able to have a custom key object provider instead, which is more flexible and powerful.

    Update: It turned out he complexity cost AND performance improvement was horrible, so this memoMap stuff is currently disabled
    with this switch, but I'm leaving the code here in case there IS a future scenario where this code may be leveraged.

    NOTE: IF you turn enableMemoMap back on you need so also find the tag
    #memoReq in this file and uncomment those blocks
    */
    static enableMemoMap: boolean = false;
    static memoMap: { [key: string]: ReactNode } = {};

    /* Note: NULL elements are allowed in this array and simply don't render anything, and are required to be tolerated and ignored */
    private children: CompIntf[];

    private cachedChildren: CompIntf[];

    logEnablementLogic: boolean = true;

    jsClassName: string;
    clazz: string;

    // holds queue of functions to be ran once this component is rendered.
    domAddFuncs: ((elm: HTMLElement) => void)[];

    renderRawHtml: boolean = false;

    /**
     * 'react' should be true only if this component and all its decendants are true React components that are rendered and
     * controlled by ReactJS (rather than our own innerHTML)
     *
     * allowRect can be set to false for components that are known to be used in cases where not all of their subchildren are react or for
     * whatever reason we want to disable react rendering, and fall back on render-to-text approach
     */
    constructor(attribs?: any) {
        this.attribs = attribs || {};
        this.children = [];

        /* If an ID was specifically provided, then use it, or else generate one */
        let id = this.attribs.id || ("c" + Comp.nextGuid());
        this.clazz = this.constructor.name;
        this.setId(id);
    }

    private setId(id: string) {
        this.attribs.id = id;
        this.attribs.key = id;
        this.jsClassName = this.constructor.name + "[" + id + "]";
    }

    /* Returns true if there are any non-null children */
    childrenExist(): boolean {
        if (this.children == null || this.children.length === 0) return false;
        return this.children.some(child => !!child);
    }

    static nextGuid(): number {
        return ++Comp.guid;
    }

    getId(): string {
        return this.attribs.id;
    }

    /* Warning: Under lots of circumstances it's better to call util.getElm rather than getElement() because getElement returns
    null unless the element is already created and rendered onto the DOM */
    getElement(): HTMLElement {
        return <HTMLElement>document.getElementById(this.getId());
    }

    // This is the original implementation of whenElm which uses a timer to wait for the element to come into existence
    // and is only used in one odd place where we manually attach Dialogs to the DOM (see DialogBase.ts)
    whenElmEx(func: (elm: HTMLElement) => void) {
        S.util.getElm(this.getId(), func);
    }

    // WARNING: Use whenElmEx for DialogBase derived components!
    whenElm(func: (elm: HTMLElement) => void) {
        // console.log("whenElm running for " + this.jsClassName);

        let elm = this.getElement();
        if (elm) {
            // console.log("Looked for and FOUND on DOM: " + this.jsClassName);
            func(elm);
            return;
        }

        // console.log("queueing the function " + this.jsClassName);
        // queue up the 'func' to be called once the domAddEvent gets executed.
        if (!this.domAddFuncs) {
            this.domAddFuncs = [func];
        }
        else {
            this.domAddFuncs.push(func);
        }
    }

    setVisible(visible: boolean) {
        this.mergeState({ visible } as any);
    }

    setEnabled(enabled: boolean) {
        this.mergeState({ enabled } as any);
    }

    setClass(clazz: string): void {
        this.attribs.className = clazz;
    }

    setInnerHTML(html: string) {
        this.whenElm(function (elm: HTMLElement) {
            elm.innerHTML = html;
        });
    }

    addChild(comp: CompIntf): void {
        if (!comp) return;
        if (!this.children) {
            this.children = [];
        }
        this.children.push(comp);
    }

    addChildren(comps: Comp[]): void {
        if (!this.children) {
            this.children = [];
        }
        this.children.push.apply(this.children, comps);
    }

    setChildren(comps: CompIntf[]) {
        this.children = comps || [];
    }

    getChildren(): CompIntf[] {
        if (!this.children) {
            this.children = [];
        }
        return this.children;
    }

    getAttribs(): Object {
        return this.attribs;
    }

    renderHtmlElm(elm: ReactElement): string {
        return renderToString(elm);
        // return renderToStaticMarkup(elm);
    }

    reactRenderHtmlInDiv(): string {
        this.updateDOM(null, this.getId() + "_re");
        return "<div id='" + this.getId() + "_re'></div>";
    }

    reactRenderHtmlInSpan(): string {
        this.updateDOM(null, this.getId() + "_re");
        return "<span id='" + this.getId() + "_re'></span>";
    }

    /* Attaches a react element directly to the dom at the DOM id specified.
       WARNING: This can only re-render the *children* under the target node and not the attributes or tag of the node itself.

       Also this can only re-render TOP LEVEL elements, meaning elements that are not children of other React Elements, but attached
       to the DOM old-school.
    */
    updateDOM(store: any = null, id: string = null) {
        if (!id) {
            id = this.getId();
        }
        // if (!this.render) {
        //     throw new Error("Attempted to treat non-react component as react: " + this.constructor.name);
        // }
        S.util.getElm(id, (elm: HTMLElement) => {
            // See #RulesOfHooks in this file, for the reason we blowaway the existing element to force a rebuild.
            ReactDOM.unmountComponentAtNode(elm);

            (this._render as any).displayName = this.jsClassName;
            let reactElm = S.e(this._render, this.attribs);

            /* If this component has a store then wrap with the Redux Provider to make it all reactive */
            if (store) {
                // console.log("Rendering with provider");
                let provider = S.e(Provider, { store }, reactElm);
                ReactDOM.render(provider, elm);
            }
            else {
                ReactDOM.render(reactElm, elm);
            }
        });
    }

    buildChildren(): ReactNode[] {
        if (Comp.renderCachedChildren && this.cachedChildren) {
            this.children = this.cachedChildren;
        }
        else {
            // looks like we don't need to clone the children, we can just use as is.
            // this.cachedChildren = [];
            // this.cachedChildren = this.cachedChildren.concat(this.children);
            this.cachedChildren = this.children;
        }

        // console.log("buildChildren: " + this.jsClassName);
        if (this.children == null || this.children.length === 0) return null;
        let reChildren: ReactNode[] = [];

        this.children.forEach(function (child: Comp) {
            if (child) {
                let reChild: ReactNode = null;
                try {
                    // console.log("ChildRender: " + child.jsClassName);
                    (this._render as any).displayName = child.jsClassName;
                    reChild = S.e(child._render, child.attribs);
                }
                catch (e) {
                    console.error("Failed to render child " + child.jsClassName + " attribs.key=" + child.attribs.key);
                }

                if (reChild) {
                    reChildren.push(reChild);
                }
                else {
                    // console.log("ChildRendered to null: " + child.jsClassName);
                }
            }
        }, this);
        return reChildren;
    }

    focus(): void {
        this.whenElm((elm: HTMLSelectElement) => {
            S.util.delayedFocus(this.getId());
        });
    }

    updateVisAndEnablement() {
        if (this.state.enabled === undefined) {
            this.state.enabled = true;
        }

        if (this.state.visible === undefined) {
            this.state.visible = true;
        }
    }

    /* Renders this node to a specific tag, including support for non-React children anywhere in the subgraph */
    tagRender(tag: string, content: string, props: any) {
        // console.log("Comp.tagRender: " + this.jsClassName + " id=" + props.id);
        this.updateVisAndEnablement();

        try {
            let children: any[] = this.buildChildren();
            if (children) {
                if (content) {
                    children.unshift(content);
                }
            }
            else {
                children = content ? [content] : null;
            }

            if (children && children.length > 0) {
                // console.log("Render Tag with children.");
                return S.e(tag, props, children);
            }
            else {
                // console.log("Render Tag no children.");
                return S.e(tag, props);
            }
        }
        catch (e) {
            console.error("Failed in Comp.tagRender" + this.jsClassName + " attribs=" + S.util.prettyPrint(this.attribs));
        }
    }

    /* This is how you can add properties and overwrite them in existing state. Since all components are assumed to have
       both visible/enbled properties, this is the safest way to set other state that leaves visible/enabled props intact
       */
    mergeState(moreState: S): any {
        this.setStateEx((state: any) => {
            this.state = { ...state, ...moreState };
            if (this.debugState) {
                console.log("mergeState final[" + this.jsClassName + "] STATE=" + S.util.prettyPrint(this.state));
            }
            return this.state;
        });
    }

    forceRender() {
        this.mergeState({ forceRender: Comp.nextGuid() } as any);
    }

    setState = (newState: any): any => {
        this.setStateEx((state: any) => {
            return this.state = { ...newState };
        });
    }

    /* Note: this method performs a direct state mod, until react overrides it using useState return value

    To add new properties...use this pattern (mergeState above does this)
    setStateFunc(prevState => {
        // Object.assign would also work
        return {...prevState, ...updatedValues};
    });

    There are places where 'mergeState' works but 'setState' fails, that needs investigation like EditNodeDlg.
    */
    setStateEx(state: any) {
        if (!state) {
            state = {};
        }
        if (typeof state === "function") {
            this.state = state(this.state);
        }
        else {
            this.state = state;
        }

        if (this.debugState) {
            console.log("setStateEx[" + this.jsClassName + "] STATE=" + S.util.prettyPrint(this.state));
        }
    }

    getState(): S {
        return this.state;
    }

    /* Derived classes can implement this to perform something similar to "React.memo" were we memoize based on wether the object
    that this function returns (or more accurately the hash of it) changes upon additional renderings */
    makeCacheKeyObj(appState: AppState, state: any, props: any) {
        return null;
    };

    // Core 'render' function used by react. Never really any need to override this, but it's theoretically possible.
    _render = (props: any): ReactNode => {
        // console.log("render(): " + this.jsClassName);
        this.rendered = true;

        let ret: ReactNode = null;
        try {
            const [state, setStateEx] = useState(this.state);

            // #memoReq
            // const [isMounted, setIsMounted] = useState<boolean>(false);

            // console.warn("Component state was null in render for: " + this.jsClassName);
            this.state = state;

            this.setStateEx = setStateEx.bind(this);
            // #memoReq
            // this.setStateEx = (state) => {
            //     //React will bark at us if we allow a setState call to execute on a component that's no longer mounted, so that's why we have the 'isMounted'
            //     //varible. The error in React says this:
            //     //Can't perform a React state update on an unmounted component. This is a no-op, but it indicates a memory leak in your application. To fix, cancel all subscriptions and asynchronous tasks in a useEffect cleanup function. in Unknown
            //     //if (!isMounted) return;
            //     setStateEx(state);
            // }

            /* This 'useEffect' call makes react call 'domAddEvent' once the dom element comes into existence on the acutal DOM */
            // #memoReq
            // useEffect(() => {
            //     setIsMounted(true);
            //     this.domAddEvent();
            // }, []);

            if (!this._domAddEvent) {
                this._domAddEvent = this.domAddEvent.bind(this);
            }

            useEffect(this._domAddEvent, []);

            // This hook should work fine but just isn't needed yet.
            if (this.domUpdateEvent) {
                // useEffect(() => {
                //     //console.log("DOM UPDATE: " + this.jsClassName);
                //     this.domUpdateEvent();
                // });
                useEffect(this.domUpdateEvent);
            }

            if (this.domPreUpdateEvent) {
                // useLayoutEffect(() => {
                //     //console.log("DOM PRE-UPDATE: " + this.jsClassName);
                //     this.domPreUpdateEvent();
                // });
                useLayoutEffect(this.domPreUpdateEvent);
            }

            /*
            This 'useEffect' call makes react call 'domRemoveEvent' once the dom element is removed from the acutal DOM.
            (NOTE: Remember this won't run for DialogBase because it's done using pure DOM Javascript, which is the same reason
            whenElmEx has to still exist right now)
            */
            // useEffect(this.domRemoveEventFunc, []);

            this.updateVisAndEnablement();

            /* Theoretically we could avoid calling preRender if it weren't for the fact that React monitors
            which hooks get called at each render cycle, so if we bypass the preRender because we wont' be using
            the children it generates, react will still throw an error becasue the calls to those hooks will not have been made.

            DO NOT DELETE THE COMMENTNED IF BELOW (it serves as warning of what NOT to do.)
            */
            // if (!Comp.renderCachedChildren) {
            this.preRender();
            // }

            let key = null;
            let appState: AppState = null;

            /* if we are caching this ReactNode (memoizing) then try to get object from cache
            instead of rendering it

            TODO: If we ever re-enable this code find a way to make it so that components not providing any makeCacheKeyObj can be detected
            and and avoid even entering into this block on a component by component basis
            */
            if (Comp.enableMemoMap) {

                // note: getting full state here is a big performance hit? There's definitely a performance issue.
                appState = useSelector(function (state: AppState) { return state; });

                // NOTE: The final experimental definition of this function is that it returns a 'string' not an object.
                let keyObj = this.makeCacheKeyObj(appState, state, props);
                // console.log("keyObj=" + S.util.prettyPrint(keyObj));
                if (keyObj) {
                    key = keyObj; // this.constructor.name + "_" + JSON.stringify(keyObj); // S.util.hashOfObject(keyObj);

                    // console.log("CACHE KEY HASH: "+key);
                    let rnode: ReactNode = Comp.memoMap[key];
                    if (rnode) {
                        // console.log("********** CACHE HIT: " + this.jsClassName);
                        return rnode;
                    }
                }
            }

            Comp.renderCounter++;
            if (this.debug) {
                console.log("calling compRender: " + this.jsClassName + " counter=" + Comp.renderCounter); // + " PROPS=" + S.util.prettyPrint(props));
            }

            ret = this.compRender();

            /* If we have the cache key provider, cache this node for later */
            if (key) {
                Comp.memoMap[key] = ret;
            }
        }
        catch (e) {
            // todo-1: this is not logging the stack
            console.error("Failed to render child (in render method)" + this.jsClassName + " attribs.key=" + this.attribs.key + " Error: " + e);
        }

        return ret;
    }

    // DO NOT DELETE
    //
    // WARNING: This isn't redundant. React requires this to be a function that returns a function.
    // domRemoveEventFunc = () => {
    //     return this.domRemoveEvent;
    // }

    // domRemoveEvent = (): void => {
    //     //console.log("DOM REMOVE:" + this.jsClassName);
    // }

    domUpdateEvent = null;

    domPreUpdateEvent = null;

    _domAddEvent: () => void = null;
    domAddEvent(): void {
        // console.log("domAddEvent: " + this.jsClassName);

        if (this.domAddFuncs) {
            let elm: HTMLElement = this.getElement();
            if (!elm) {
                console.error("elm not found in domAddEvent: " + this.jsClassName);
                return;
            }
            else {
                // console.log("domAddFuncs running for "+this.jsClassName+" for "+this.domAddFuncs.length+" functions.");
            }
            this.domAddFuncs.forEach(function (func) {
                func(elm);
            }, this);
            this.domAddFuncs = null;
        }
    }

    /* Intended to be optionally overridable to set children, and the ONLY thing to be done in this method should also be
    just to set the children */
    preRender(): void {
    }

    // This is the function you override/define to implement the actual render method, which is simple and decoupled from state
    // manageent aspects that are wrapped in 'render' which is what calls this, and the ONLY function that calls this.
    abstract compRender(): ReactNode;
}
