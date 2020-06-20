import { ServerPushIntf } from "./intf/ServerPushIntf";
import { Singletons } from "./Singletons";
import { PubSub } from "./PubSub";
import { Constants as C } from "./Constants";
import * as J from "./JavaIntf";
import { InboxNotifyDlg } from "./dlg/InboxNotifyDlg";
import { store, dispatch } from "./AppRedux";
import { AppState } from "./AppState";

let S: Singletons;
PubSub.sub(C.PUBSUB_SingletonsReady, (s: Singletons) => {
    S = s;
});

// reference: https://www.baeldung.com/spring-server-sent-events
// See also: AppController.java#serverPush
//
export class ServerPush implements ServerPushIntf {
    init = (): any => {
        console.log("ServerPush.init");

        const eventSource = new EventSource(S.util.getRpcPath() + "serverPush");

        // DO NOT DELETE.
        // eventSource.onmessage = e => {
        // };

        eventSource.onopen = (e: any) => {
            //onsole.log("ServerPush.onopen" + e);
        }

        eventSource.onerror = (e: any) => {
            //console.log("ServerPush.onerror:" + e);
        };

        eventSource.addEventListener("feedPush", function (e: any) {
            let obj = JSON.parse(e.data);
            //console.log("Incomming Push: "+S.util.prettyPrint(obj));
            let nodeInfo: J.NodeInfo = obj.nodeInfo;
            if (nodeInfo) {
                //todo-0: I think this dispatch is working, but another full FeedView refresh (from actual server query too) is somehow following after also
                //so need to check and see how to avoid that.
                dispatch({
                    type: "Action_RenderFeedResults",
                    update: (s: AppState): void => {
                        s.feedResults = s.feedResults || [];

                        //this is a slight hack to cause the new rows to animate their background, but it's ok, and I plan to leave it like this
                        S.render.fadeInId = nodeInfo.id;
                        s.feedResults.unshift(nodeInfo);

                        //todo-0: need to scan for any nodes in feedResults where nodeInfo.parent.id is found in the list nodeInfo.id, and
                        //then remove the nodeInfo.id from the list becasue it would be redundant in the list.
                        //s.feedResults = S.meta64.removeRedundantFeedItems(s.feedResults);
                    }
                });
            }
        }, false);

        eventSource.addEventListener("inboxPush", function (e: any) {
            //Removing this type notification for now, because it's not really ready. For example, if bob creates a reply to a feed item bob gets
            //the notification, which is wrong. In other words based on the new 'feed' capability notification can
            //end up being just a redundant annoyance.
            //todo-0
            //new InboxNotifyDlg("Your Inbox has updates!", store.getState()).open();
        }, false);
    }
}

